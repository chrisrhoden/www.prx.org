angular.module('angular-hal', ['ng', 'uri-template'])
.provider('ngHal', function () {
  function bind (object, fun) {
    return function () {
      return fun.apply(object, Array.prototype.slice.call(arguments));
    };
  }

  function wrap (Wrapper, fun) {
    return function () {
      var thing = fun.apply(undefined, Array.prototype.slice.call(arguments));
      return new Wrapper(thing);
    };
  }

  function memoized (object, method) {
    var responses = {};
    var memoizedFunction = function () {
      var args = [].slice.call(arguments);
      if (typeof responses[args] === 'undefined') {
        responses[args] = method.apply(object, args);
      }
      return responses[args];
    };
    memoizedFunction._memoized = true;
    return memoizedFunction;
  }

  function memoize (object, methods) {
    methods = [].slice.call(arguments, 1);
    angular.forEach(methods, function (method) {
      var oldMethod = object[method];
      if (!oldMethod._memoized) {
        object[method] = memoized(object, oldMethod);
      }
    });
  }

  function constructor (mods) {
    var Base = Object.create(HAL.Document.prototype);
    angular.forEach(mods, function (module) {
      if (typeof modules[module] !== 'undefined') {
        Base = Object.create(angular.extend(Base, modules[module]));
      }
    });
    var cxt = function (document, config) {
      HAL.Document.call(this, document, config);
    };
    cxt.prototype = Base;
    return cxt;
  }

  function constructDocument (document, config, mods) {
    if (typeof constructorCache[mods] === 'undefined') {
      constructorCache[mods] = constructor(mods);
    }
    var ExtendedDocument = constructorCache[mods];
    return new ExtendedDocument(document, config);
  }

  var HAL = {
    Document: function (document, config) {
      var links = {};
      angular.forEach(document._links, function (link, rel) {
        links[rel] = new HAL.Link(link, rel, config ? config.url : undefined);
      });
      if (typeof links['self'] === 'undefined' && typeof config !== 'undefined') {
        links.self = new HAL.Link({href: config.url}, 'self', config.url);
      }
      this.link = function (rel) { return links[rel]; };
      memoize(this, '_follow', 'follow');
      delete document['_links'];
      angular.extend(this, document);
    },
    DocPromise: function (promise, mods) {
      HAL.Promise.call(this, $q.all({response: promise, mods: $q.when(mods)}).then(function (args) {
        return constructDocument(args.response.data, args.response.config, args.mods);
      }));
      memoize(this, 'get', 'call', 'link', 'follow', 'url');
    },
    Link: function (linkspec) {
      if (linkspec.templated) {
        this.templated = true;
        this.template = UriTemplate.parse(linkspec.href);
      } else {
        this.string = linkspec.href;
      }
      this.profile = linkspec['profile'];
    },
    Promise: function (promise) {
      promise = $q.when(promise);
      this['finally'] = wrap(HAL.Promise, bind(promise, promise['finally']));
      this.then = wrap(HAL.Promise, bind(promise, promise.then));
      memoize(this, 'get', 'call');
    }
  };

  HAL.Promise.prototype = {
    'catch': function (errback) {
      return this.then(undefined, errback);
    },
    'get': function (property) {
      return this.then(function (data) {
        return data[property];
      });
    },
    'call': function (method) {
      var args = Array.prototype.slice.call(arguments, 1);
      return this.then(function (data) {
        return data[method].apply(data, args);
      });
    }
  };

  HAL.Document.prototype = {
    _follow: function (rel, params) {
      return $http.get(this.link(rel).href(params));
    },
    follow: function follow (rel, params) {
      return new HAL.DocPromise(this._follow(rel, params));
    },
    url: function url () {
      return this.link('self').href();
    },
    persisted: function persisted () {
      return !!this.link('self');
    },
    save: function save () {
      var self = this;
      if (this.persisted()) {
        return $http.put(this.url(), this).then(function () {
          return self;
        });
      } else {
        return $http.post(this.link('create').href(), this).then(function (response) {
          HAL.Document.call(self, response.data, response.config);
          return self;
        });
      }
    },
    destroy: function destroy () {
      $http['delete'](this.url());
    },
    build: function build (rel) {
      var link = this.link(rel);
      return constructDocument({_links: {create: {href: link.href() }}}, undefined, [link.profile, rel]);
    }
  };

  HAL.Link.prototype = {
    href: function (params) {
      if (this.templated) {
        return this.template.expand(params);
      } else {
        return this.string;
      }
    }
  };

  HAL.DocPromise.prototype = angular.extend({}, HAL.Promise.prototype);
  angular.extend(HAL.DocPromise.prototype, {
    link: function link (rel) {
      return this.then(function (document) {
        return document.link(rel) || $q.reject('no such link' + rel);
      });
    },
    follow: function follow (rel, params) {
      return new HAL.DocPromise(this.then(function (document) {
        return document._follow(rel, params);
      }), this.then(function (document) {
        return [document.link(rel).profile, rel];
      }));
    },
    url: function url () {
      return this.then(function (document) {
        return document.url();
      });
    },
    destroy: function destroy () {
      return this.then(function (document) {
        return document.destroy();
      });
    },
    build: function build (rel) {
      return this.then(function (document) {
        return document.build(rel);
      });
    }
  });

  var root, $q, $http, UriTemplate, modules = {}, constructorCache = {};

  this.setRootUrl = function (rootUrl) {
    root = rootUrl;
  };

  this.defineModule = function (uri, module) {
    if (typeof modules[uri] === 'undefined') {
      modules[uri] = angular.copy(module);
    } else {
      angular.extend(modules[uri], module);
    }
  };

  this.$get = ['$http', '$q', 'UriTemplate', function (h, q, u) {
    $http = h;
    $q = q;
    UriTemplate = u;
    return new HAL.DocPromise(h.get(root), ['root']);
  }];
});
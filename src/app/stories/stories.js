angular.module('prx.stories', ['ui.router', 'prx.modelConfig', 'prx.player', 'prx.url-translate', 'prx.accounts', 'prx.experiments'])
.config(function ($stateProvider, ngHalProvider, $urlRouterProvider, urlTranslateProvider) {
  $stateProvider
  .state('story', {
    abstract: true,
    title: 'Stories'
  })
  .state('story.show', {
    url: '/stories/:storyId?s&play',
    views: {
      '@': {
        controller: 'StoryCtrl as story',
        templateUrl: 'stories/story.html'
      }
    },
    title: ['story', 'account', function (story, account) { return story.toString() + ' by ' + account.toString(); }],
    resolve: {
      story: ['ngHal', '$stateParams', function (ngHal, $stateParams) {
        return ngHal.followOne('prx:story', {id: $stateParams.storyId});
      }],
      account: ['story', function (story) {
        return story.follow('prx:account');
      }],
      audioUrls: ['story', function (story) {
        return story.toSoundParams().then(function (sfParams) {
          return sfParams.audioFiles;
        });
      }],
      coverExperiment: ['prxperiment', function (prxperiment) {
        return prxperiment.participate('storyCover', ['blueMics', 'matt']);
      }]
    }
  })
  .state('story.show.details', {
    url: '/details',
    views: {
      'modal@': {
        controller: 'StoryDetailCtrl as story',
        templateUrl: 'stories/detail_modal.html'
      }
    }
  })
  .state('story.show.content_advisory', {
    views: {
      'modal@': {
        controller: 'StoryDetailCtrl as story',
        templateUrl: 'stories/content_advisory_modal.html'
      }
    }
  })
  .state('story.show.timingCues', {
    views: {
      'modal@': {
        controller: 'StoryDetailCtrl as story',
        templateUrl: 'stories/timing_cues_modal.html'
      }
    }
  })
  ;

  /* istanbul ignore else */
  if (FEAT.LISTEN_LATER) {
    $stateProvider.state('story.remindMe', {
      views: {
        'modal@': {
          controller: 'StoryDetailCtrl as story',
          templateUrl: 'stories/remind_me_modal.html'
        }
      }
    });
  }

  $urlRouterProvider.when('/pieces/:pieceId', "/stories/{pieceId}");
  urlTranslateProvider.translate('/stories/:storyId', '/pieces/{storyId}');

  ngHalProvider.setRootUrl(FEAT.apiServer)
  .mixin('http://meta.prx.org/model/story/*any', ['resolved', function (resolved) {
    resolved.imageUrl = resolved.follow('prx:image').get('enclosureUrl').or(null);
    return function (story) {
      if (angular.isDefined(story.length)) {
        story.duration = story.length;
        story.length = undefined;
        return story;
      }
    };
  }]).mixin('http://meta.prx.org/model/story/*any', ['prxPlayer', function (prxPlayer) {
    return {
      toString: function () { return this.title; },
      stateParams: function () {
        return { storyId: this.id, s: null, play: null };
      },
      toSoundParams: function () {
        var self = this;
        return this.follow('prx:audio').then(function (files) {
          var result = [];
          angular.forEach(files, function (file) {
            result.push({id: file.id, duration: file.duration * 1000, url: file.links('enclosure').url()});
          });
          return { audioFiles: result, story: self };
        });
      },
      playing: function () {
        return prxPlayer.nowPlaying && prxPlayer.nowPlaying.story.id == this.id;
      }
    };
  }]);
})
.directive('prxStory', function () {
  return {
    restrict: 'E',
    replace: true,
    templateUrl: 'stories/embedded_story.html',
    scope: {story: '='}
  };
})
.controller('StoryCtrl', function (story, account, audioUrls,
  prxSoundFactory, $stateParams, prxPlayer, prxperiment) {
  var storyCtrl = this;

  this.current = story;
  this.account = account;
  this.cover = prxperiment.get('storyCover');
  this.sound = prxSoundFactory({ story: story, producer: account,
    audioFiles: audioUrls, next: function (sound) {
      return account.generatePlaylist(sound);
    }
  });
  if (angular.isDefined($stateParams.s) && $stateParams.s !== null) {
    this.sound.setPosition($stateParams.s * 1000);
  }
  if ((angular.isDefined($stateParams.s) && $stateParams.s !== null) || $stateParams.play) {
    prxPlayer.play(this.sound);
  }

  this.current.follow('prx:license').then(function (license) {
    storyCtrl.license = license;
  });
})
.controller('StoryDetailCtrl', function (story) {
  this.current = story;
})
.directive('prxSocialActions', function($location) {
  return {
    restrict: 'E',
    replace: true,
    templateUrl: 'stories/social_actions.html',
    scope: {
      text: '='
    },
    link: function (scope, elem, attrs, ctrl) {
      scope.$location = $location;
    }
  };
})
.filter('simpleFormat', function () {
  return function (string) {
    return "<p>" + string.replace(/[\n]{2,}/g, '</p><p>').replace(/\n/g, "<br>") + "</p>";
  };
})
.filter('highlightTimecodes', function () {
  return function (string) {
    return string.replace(/([\d]{1,2}:){1,2}\d\d/g, "<strong>$&</strong>");
  };
})
.filter('sentence', function () {
  return function (list) {
    if (list && list.length) {
      if (list.length == 1) {
        return list[0];
      } else if (list.length == 2) {
        return list.join(' and ');
      } else {
        return [list.slice(0, list.length-1).join(', '), list[list.length-1]].join(', and ');
      }
    } else {
      return list;
    }
  };
})
.filter('absUrl', function () {
  var PROTOCOL_SEPARATOR = /:\/\//;

  return function (url) {
    if (!angular.isString(url) || PROTOCOL_SEPARATOR.exec(url)) {
      return url;
    }
    return 'http://' + url;
  };
})
.filter('prettyUrl', function () {
  var EXPRESSION = /(^(https?:\/\/)?(www\.)?)|(\/$)/ig;
  var EMPTY_STRING = '';

  return function (url) {
    if (!angular.isString(url)) {
      return url;
    }
    return url.replace(EXPRESSION, EMPTY_STRING);
  };
})
;

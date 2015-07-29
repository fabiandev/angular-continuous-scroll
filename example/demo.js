(function ( angular ) {
  'use strict';

  // Module
  angular.module('Demo', [ 'fw.continuousScroll' ]);

  // Config
  angular.module('Demo')
    .config(function ( $locationProvider ) {
      $locationProvider.html5Mode(true);
    });

  // Service
  angular.module('Demo')
    .factory('PostLoader', function ( $http, $q ) {
      function PostLoader () {
      }

      PostLoader.prototype.init = function ( params ) {
        params = angular.extend({ page: 1 }, params);

        // Properties
        this.pagination = { perPage: 20, maxPages: 50 };
        this.posts      = [];

        // Load the initial page, using the URL param if available
        return this.load(params.page);
      };

      PostLoader.prototype.load = function ( page ) {
        page = parseInt(page, 10);
        page = isNaN(page) ? 1 : page;

        var method = this.pagination.lastPage && page < this.pagination.lastPage ? 'unshift' : 'push';

        // Define the current page
        if (this.pagination.totalPages) {
          page = Math.min(Math.max(page, 1), this.pagination.totalPages);
        }

        // Only load a new page if it is not already loaded
        if ((page > this.pagination.lastPage || ! this.pagination.lastPage) ||
          (page < this.pagination.firstPage || ! this.pagination.firstPage)) {
          return this.get(page)
            .success(angular.bind(this, function ( data ) {
              var response = data.response;

              // Set the last page
              if (! this.pagination.lastPage || page > this.pagination.lastPage) {
                this.pagination.lastPage = page;
              }

              // Set the first page, if not already set
              if (! this.pagination.firstPage || page < this.pagination.firstPage) {
                this.pagination.firstPage = page;
              }

              // Determine the total number of pages
              this.pagination.totalPages = Math.ceil(response.total_posts / this.pagination.perPage);

              if (this.pagination.maxPages) {
                this.pagination.totalPages = Math.min(this.pagination.totalPages, this.pagination.maxPages);
              }

              // Append or prepend the fetched posts, depending if they are posts from the next or previous page
              this.posts[ method ].apply(this.posts, response.posts);

              // Return the array of posts
              return response.posts;
            }));
        } else {
          return $q.reject();
        }
      };

      PostLoader.prototype.next = function () {
        var page = ! this.pagination.lastPage ? 1 : this.pagination.lastPage + 1;

        // Get the next page
        return this.load(page);
      };

      PostLoader.prototype.previous = function () {
        var page = ! this.pagination.firstPage ? 1 : this.pagination.firstPage - 1;

        // Get the previous page
        return this.load(page);
      };

      PostLoader.prototype.get = function ( page ) {
        var url    = 'http://api.tumblr.com/v2/blog/fuckyeahcats.tumblr.com/posts/photo',
            config = {
              params: {
                api_key: 'z46iUTiovIf3N5KdioKhU2vvTBMWRHA8KLeIBruDnEHTXpiK8n',
                jsonp: 'JSON_CALLBACK',
                limit: this.pagination.perPage
              }
            };

        // Define the post number to start from
        config.params.offset = (page - 1) * config.params.limit;

        // Make a HTTP request
        return $http.jsonp(url, config);
      };

      return {
        create: function () {
          return new PostLoader();
        }
      };
    });

  // Controller
  angular.module('Demo')
    .controller('MainController', function ( $scope, $location, $timeout, PostLoader ) {

      // Scope vars
      $scope.initialPage = parseInt($location.search().page || '1', 10);
      $scope.currentPage = $scope.initialPage;
      $scope.perPage     = 20;

      // Private vars
      var postLoader = PostLoader.create();

      // Private methods
      function onPageLoad () {
        $scope.posts      = postLoader.posts;
        $scope.pagination = postLoader.pagination;

        $timeout(function () {
          $scope.loading = false;
        });
      }

      function onPageLoadError () {
        $scope.loading = false;
      }

      // Scope methods
      $scope.nextPage = function nextPage () {
        $scope.loading = true;

        postLoader.next().then(onPageLoad, onPageLoadError);
      };

      $scope.previousPage = function previousPage (event) {
        $scope.loading = true;

        postLoader.previous().then(onPageLoad, onPageLoadError);

        event.preventDefault();
      };

      function updatePage ( event, EndlessScroller ) {
        $scope.initialPage = EndlessScroller.initialPage;
        $scope.currentPage = EndlessScroller.currentPage;
        $location.search('page', $scope.currentPage);
      };

      // Register event handlers
      $scope.$on('scroller.page:next', $scope.nextPage);
      $scope.$on('scroller.page:previous', $scope.previousPage);
      $scope.$on('scroller.page:update', updatePage);

      // Initialise
      var params = {
        page: $scope.initialPage
      };

      postLoader.init(params).then(onPageLoad);
    });
})(window.angular);

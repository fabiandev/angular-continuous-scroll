/*!
 * angular-continuous-scroll.js v0.0.5
 * https://github.com/fabianweb/angular-continuous-scroll
 * Original work Copyright 2014 David Chin * Modified work Copyright 2015 Fabian Pirklbauer
 * Based on angular-endless-scroll.js by David Chin
 * MIT License
 */
(function () {
  'use strict';

  /**
   * @namespace dc
   */

  /**
   * @module fw.continuousScroll
   *
   * @description
   * A module for implementing an endless/infinite scroll user interface.
   */
  angular.module('fw.continuousScroll', []);
})();

(function() {
  'use strict';

  angular.module('fw.continuousScroll')

  /**
   * @member fw.continuousScroll.continuousScroll
   *
   * @description
   * A directive for implementing an endless scrolling list.
   */
    .directive('continuousScroll', function( $window, $timeout ) {
      var NG_REPEAT_REGEXP = /^\s*(.+)\s+in\s+([\r\n\s\S]*?)\s*(\s+track\s+by\s+(.+)\s*)?$/;

      /**
       * @function throttle
       * @private
       * @param {Function} fn
       * @param {number} delay
       * @returns {Function}
       *
       * @description
       * Return a function that only gets executed once within a given time period.
       */
      function throttle( fn, delay ) {
        var timeout,
            previous = 0;

        return function() {
          var current   = new Date().getTime(),
              remaining = delay - (current - previous),
              args      = arguments;

          if (remaining <= 0) {
            if (timeout) {
              $timeout.cancel(timeout);
            }

            timeout  = undefined;
            previous = current;

            fn.apply(this, args);
          } else if (!timeout) {
            timeout = $timeout(function() {
              timeout  = undefined;
              previous = new Date().getTime();

              fn.apply(this, args);
            }, remaining);
          }
        };
      }

      /**
       * @function parseNgRepeatExp
       * @private
       * @param {string} expression
       * @returns {Object}
       *
       * @description
       * Parse ngRepeat expression and
       * return the name of the loop variable, the collection and tracking expression
       */
      function parseNgRepeatExp( expression ) {
        var matches = expression.match(NG_REPEAT_REGEXP);

        return {
          item: matches[ 1 ],
          collection: matches[ 2 ],
          trackBy: matches[ 3 ]
        };
      }

      /**
       * @constructor fw.continuousScroll.EndlessScroller
       * @param {Object} scope The scope of the directive.
       * @param {Object} element The element of the directive.
       * @param {Object} attrs The attributes of the directive.
       *
       * @description
       * The controller of endlessScroll directive.
       * Each directive creates an instance of EndlessScroller.
       */
      function EndlessScroller( scope, element, attrs ) {
        var defaultOptions = {
          offset: -100,
          throttle: 300,
          perPage: 20,
          initialPage: 1
        };

        // Priviledged properties
        this.initialized       = false;
        this.scope             = scope;
        this.attrs             = attrs;
        this.element           = $(element);
        this.options           = angular.extend({}, defaultOptions, this.scope.$eval(this.attrs.scrollOpts));
        this.docWindow         = $($window);
        this.window            = this.options.window ? $(this.options.window) : this.docWindow;
        this.dimension         = { window: {}, parent: {}, items: [] };
        this.status            = {};
        this.expression        = parseNgRepeatExp(this.attrs.continuousScroll);
        this.placeholder       = null;
        this.placeholderBottom = null;
        this.initialPage       = parseInt(this.scope.initialPage || this.options.initialPage, 10);
        this.loadedPages       = 0;
        this.perPage           = parseInt(this.scope.perPage || this.options.perPage, 10);
        this.currentPage       = this.initialPage;
        this.updatedDefault    = { unshifted: false, unshiftedCount: 0, pushed: false, pushedCount: 0 };
        this.updated           = this.updatedDefault;

        // Watch for events and scope changes
        this._watch();
      }

      /**
       * @function fw.continuousScroll.EndlessScroller#check
       *
       * @description
       * Check to see if more items need to be fetched
       * by checking if the user has scrolled to the bottom or top.
       */
      EndlessScroller.prototype.check = function check() {
        // Determine if scrolling up or down and if we reach the end of list or not
        angular.extend(this.status, this._getScrollStatus());

        // Determine window dimension
        this.dimension.window = this._getDimension('window');

        // Determine parent element dimension
        this.dimension.parent = this._getDimension('parent');

        // Clean up off-screen elements
        this.clean();

        // If scrolled to bottom, request more items
        if (this.status.isEndReached && this.status.isScrollingDown &&
          this.dimension.parent.bottom + this.options.offset <= this.dimension.window.bottom) {
          this.next();
        }

        // If scrolled to top, request more items
        if (this.status.isStartReached && this.status.isScrollingUp &&
          this.dimension.parent.top - this.options.offset >= this.dimension.window.top) {
          this.previous();
        }
      };

      /**
       * @function fw.continuousScroll.EndlessScroller#next
       *
       * @description
       * Request the next page of items by notifying its parent controller.
       */
      EndlessScroller.prototype.next = function next() {
        if (!this.status.isPendingNext) {
          this._setPending('next', true);

          // Notify parent scope
          this.scope.$emit('scroller.page:next', this);
        }
      };

      /**
       * @function fw.continuousScroll.EndlessScroller#previous
       *
       * @description
       * Request the previous page of items by notifying its parent controller.
       */
      EndlessScroller.prototype.previous = function previous() {
        if (!this.status.isPendingPrevious) {
          this._setPending('previous', true);

          // Notify parent scope
          this.scope.$emit('scroller.page:previous', this);
        }
      };

      /**
       * @function fw.continuousScroll.EndlessScroller#update
       * @param {Array} collection A list of items bound to the directive.
       *
       * @description
       * Insert new items before or after a list of existing items and render them.
       */
      EndlessScroller.prototype.update = function update( collection ) {
        var beforeItems,
            afterItems,
            firstCommonItemIndex,
            lastCommonItemIndex,
            oldCollection,
            i,
            len;

        // KLUGE: collection == oldCollection before AngularJS 1.2.15
        oldCollection = this.previousOriginalItems;

        // Retain reference to original items
        this.originalItems = collection;

        // Get new items
        if (angular.isArray(collection) && angular.isArray(oldCollection)) {
          // Find first common item index
          for (i = 0, len = collection.length; i < len; i++) {
            if (collection[ i ] === oldCollection[ 0 ] && collection[ i ] !== undefined) {
              firstCommonItemIndex = i;
              break;
            }
          }

          // Find last common item index
          for (i = collection.length - 1; i >= 0; i--) {
            if (collection[ i ] === oldCollection[ oldCollection.length - 1 ] && collection[ i ] !== undefined) {
              lastCommonItemIndex = i;
              break;
            }
          }

          if (firstCommonItemIndex) {
            beforeItems = collection.slice(0, firstCommonItemIndex);
          }

          if (lastCommonItemIndex) {
            afterItems = collection.slice(lastCommonItemIndex + 1);
          }
        }

        // Add to items
        if (!angular.isArray(this.items) || this.items.length === 0) {
          if (angular.isArray(collection)) {
            this.items = collection.slice();
          }
        } else {
          if (beforeItems) {
            this.items.unshift.apply(this.items, beforeItems);

            // Add placeholders for new items to the top of the dimension array
            this.dimension.items.unshift.apply(this.dimension.items, new Array(beforeItems.length));

            // Adjust the initial page
            if (this.initialPage > 1) {
              $timeout(angular.bind(this, function() {
                this.initialPage--;
              }));
            }
          }

          if (afterItems) {
            this.items.push.apply(this.items, afterItems);
          }
        }

        this.updated = {
          unshifted: !!beforeItems,
          unshiftedCount: beforeItems ? beforeItems.length : 0,
          pushed: !!afterItems,
          pushedCount: afterItems ? afterItems.length : 0,
        };

        // Previous collection
        if (angular.isArray(collection)) {
          this.previousOriginalItems = collection.slice();
        }

        // Flag status
        $timeout(angular.bind(this, function() {
          this._setPending('next', false);
          this._setPending('previous', false);

          // Perform check
          if (angular.isArray(collection) && angular.isArray(oldCollection)) {
            this.check();
          }
        }));
      };

      EndlessScroller.prototype.init = function init() {
        var defaultPlaceholderAttrs,
            parent,
            children,
            itemTagName;

        parent = this._getParent();

        // Set default placeholder attrs
        defaultPlaceholderAttrs = {
          visibility: 'hidden',
          padding: 0,
          border: 0
        };

        // Determine tag name
        children    = this._getChildren();
        itemTagName = children.get(0) && children.prop('tagName').toLowerCase();

        // Create placeholder
        if (!this.placeholder && itemTagName) {
          this.placeholder = $('<' + itemTagName + '>');

          // Insert placeholder before all items
          this.placeholder
            .css(defaultPlaceholderAttrs)
            .prependTo(parent);
        }

        // Create bottom placeholder
        if (!this.placeholderBottom) {
          this.placeholderBottom = $('<' + itemTagName + '>');

          // Set clear both style
          defaultPlaceholderAttrs.clear = 'both';

          // Insert placeholder after all items
          this.placeholderBottom
            .css(defaultPlaceholderAttrs)
            .appendTo(parent);
        }

        this.initialized = true;
      };

      /**
       * @function fw.continuousScroll.EndlessScroller#clean
       *
       * @description
       * Remove items which are not visible in the viewport from DOM
       * and re-insert them when they become visible again.
       */
      EndlessScroller.prototype.clean = function clean() {
        var firstVisibleItemIndex,
            lastVisibleItemIndex,
            placeholderHeight,
            newItems,
            i;

        // Determine dimension of each repeated element
        this.dimension.items = this._getDimension('items');

        // Correct offsets of non visible items after items were added to the top
        if (this.updated.unshifted === true) {
          var firstNewItem = this.dimension.items[ 0 ];
          var lastNewItem  = this.dimension.items[ this.updated.unshiftedCount - 1 ];

          var top    = firstNewItem.top * -1 + lastNewItem.top;
          var bottom = firstNewItem.bottom * -1 + lastNewItem.bottom;

          for (i = this.items.length - 1; i < this.dimension.items.length; i++) {
            this.dimension.items[ i ].top += top;
            this.dimension.items[ i ].bottom += bottom;
          }
        }

        if (this.dimension.items && this.originalItems &&
          this.dimension.items.length === this.originalItems.length) {

          // Create placeholder in DOM if necessary
          if (this.initialized === false) {
            this.init();
          }

          // Determine first and last visible item
          angular.forEach(this.dimension.items, function( dimension, itemIndex ) {
            var isVisible = dimension.bottom >= this.dimension.window.top - this.dimension.window.height &&
              dimension.top <= this.dimension.window.bottom + this.dimension.window.height;

            // Set reference to item index
            if (isVisible) {
              if (firstVisibleItemIndex === undefined) {
                firstVisibleItemIndex = itemIndex;
              }

              lastVisibleItemIndex = itemIndex;
            }
          }, this);

          // Calculate total space occupied by items before the first visible item
          if (firstVisibleItemIndex !== undefined) {
            placeholderHeight = this.dimension.items[ firstVisibleItemIndex ].top - this.dimension.parent.top;
          } else {
            placeholderHeight = 0;
          }

          this.placeholder.height(placeholderHeight);

          // Add to items
          if (firstVisibleItemIndex !== undefined && lastVisibleItemIndex !== undefined &&
            angular.isArray(this.items) && angular.isArray(this.originalItems)) {

            newItems = this.originalItems.slice(firstVisibleItemIndex, lastVisibleItemIndex + 1);
            this.items.splice.apply(this.items, [ 0, this.items.length ].concat(newItems));

            var currentPage  = this.currentPage;
            this.loadedPages = Math.ceil(this.originalItems.length / this.perPage);
            this.currentPage = Math.round(firstVisibleItemIndex / this.perPage) + this.initialPage;

            if (currentPage !== this.currentPage) {
              this.scope.$emit('scroller.page:update', this);
            }

          }
        }

        this.updated = this.updatedDefault;
      };

      /**
       * @function fw.continuousScroll.EndlessScroller#_watch
       * @protected
       *
       * @description
       * Watch for changes to scope properties and events fired by the scope and DOM
       */
      EndlessScroller.prototype._watch = function _watch() {
        var collectionExp = this.expression.collection;

        if (collectionExp) {
          // Watch for data changes
          this.scope.$watchCollection(collectionExp, angular.bind(this, function() {
            this.update.apply(this, arguments);
          }));

          // Watch placholder height to adjust bottom placeholder
          this.scope.$watch(
            angular.bind(this, function() {
              return this.placeholder ? this.placeholder.height() : 0;
            }),
            angular.bind(this, function( newValue, oldValue ) {
              // TODO: fix issue when reaching eof

              if (this.status.isEndReached) {
                console.log('endisreached');
                this.placeholderBottom.height(0);
                return;
              }

              if (newValue !== oldValue) {
                var diff   = newValue - oldValue,
                    height = this.placeholderBottom.height() - diff;

                this.placeholderBottom.height(height < 0 ? 0 : height);
              }
            })
          );

          // Watch for onScroll event
          this.window.on('scroll', this._boundOnScroll = angular.bind(this, this._onScroll));

          // Watch for $destroy event
          this.scope.$on('$destroy', angular.bind(this, this._unwatch));
        }
      };

      /**
       * @function fw.continuousScroll.EndlessScroller#_unwatch
       * @protected
       *
       * @description
       * Watch for changes to scope properties and events fired by the scope and DOM
       */
      EndlessScroller.prototype._unwatch = function _unwatch() {
        if (this._boundOnScroll) {
          this.window.off('scroll', this._boundOnScroll);
        }
      };

      /**
       * @function fw.continuousScroll.EndlessScroller#_setPending
       * @protected
       * @param {string} type
       * @param {boolean} [bool=true]
       *
       * @description
       * Set a flag to indicate if the directive is pending for more items.
       */
      EndlessScroller.prototype._setPending = function _setPending( type, bool ) {
        var attr = 'isPending' + type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();

        this.status[ attr ] = angular.isUndefined(bool) ? true : !!bool;
        this.timeouts       = this.timeouts || {};

        if (this.status[ attr ]) {
          if (this.timeouts[ attr ]) {
            $timeout.cancel(this.timeouts[ attr ]);
            delete this.timeouts[ attr ];
          }

          // Automatically set the wait status to false after a time period
          this.timeouts[ attr ] = $timeout(angular.bind(this, function() {
            this.status[ attr ] = false;
          }), 5000);
        }
      };

      /**
       * @function fw.continuousScroll.EndlessScroller#_onScroll
       * @protected
       *
       * @description
       * An event handler for scrolling.
       */
      EndlessScroller.prototype._onScroll = function _onScroll() {
        this.scope.$apply(angular.bind(this, function() {

          // Define a throttled check method, if it's not already defined
          if (!this._throttledCheck) {
            this._throttledCheck = throttle(angular.bind(this, this.check), this.options.throttle);
          }

          // Check if there's a need to fetch more data
          this._throttledCheck();
        }));
      };

      /**
       * @function fw.continuousScroll.EndlessScroller#_getParent
       * @protected
       * @returns {Object} The parent element of the directive element.
       *
       * @description
       * Find the parent element of the directive and return it.
       */
      EndlessScroller.prototype._getParent = function _getParent() {
        if (!this._parent || !this._parent.get(0)) {
          this._parent = this.element.parent();
        }

        return this._parent;
      };

      /**
       * @function fw.continuousScroll.EndlessScroller#_getOffsetTop
       * @protected
       * @returns {Number} The offset top of an element relative to the document
       *
       * @description
       * Get the offset top of an element
       */
      EndlessScroller.prototype._getOffsetTop = function _getOffsetTop( element ) {
        var offset = element.offset();

        if (this.window.get(0) === $window) {
          return offset.top;
        } else {
          return offset.top + this.window.scrollTop() - this.docWindow.scrollTop();
        }
      };

      /**
       * @function fw.continuousScroll.EndlessScroller#_getDimension
       * @protected
       * @param {string} type
       */
      EndlessScroller.prototype._getDimension = function _getDimension( type ) {
        var height,
            top,
            bottom,
            parent = this._getParent();

        switch (type) {
          case 'window':
            height = this.window.outerHeight();
            top    = this.window.scrollTop();
            bottom = top + height;

            return {
              height: height,
              top: top,
              bottom: bottom
            };

          case 'parent':
            height = parent.outerHeight();
            top    = parent.get(0) && this._getOffsetTop(parent);
            bottom = top + height;

            return {
              height: height,
              top: top,
              bottom: bottom
            };

          case 'items':
            var itemIndex,
                items = this.dimension.items.slice();

            this._getChildren()
              .each(angular.bind(this, function( i, child ) {
                child     = $(child);
                height    = child.outerHeight();
                top       = child.get(0) && this._getOffsetTop(child);
                bottom    = top + height;
                itemIndex = $.inArray(child.scope()[ this.expression.item ], this.originalItems);

                // Set reference to the dimension of each visible element
                if (itemIndex > -1) {
                  items[ itemIndex ] = {
                    height: height,
                    top: top,
                    bottom: bottom
                  };
                }
              }));

            return items;
        }
      };

      /**
       * @function fw.continuousScroll.EndlessScroller#_getScrollStatus
       * @protected
       * @returns {Object} An object containing information about the scroll status of the directive element.
       */
      EndlessScroller.prototype._getScrollStatus = function _getScrollStatus() {
        var windowTop = this.window.scrollTop(),
            status    = {};

        if (this.dimension.window.top > 0) {
          status.isScrollingUp   = windowTop - this.dimension.window.top < 0;
          status.isScrollingDown = windowTop - this.dimension.window.top > 0;
        } else {
          status.isScrollingUp   = false;
          status.isScrollingDown = true;
        }

        if (angular.isArray(this.items) && angular.isArray(this.originalItems)) {
          status.isEndReached   = this.items[ this.items.length - 1 ] === this.originalItems[ this.originalItems.length - 1 ];
          status.isStartReached = this.items[ 0 ] === this.originalItems[ 0 ];
        } else {
          status.isEndReached   = true;
          status.isStartReached = false;
        }

        return status;
      };

      /**
       * @function fw.continuousScroll.EndlessScroller#_getChildren
       * @protected
       * @returns The child elements of the directive element. It is the list of items which are currently rendered in DOM.
       */
      EndlessScroller.prototype._getChildren = function _getChildren() {
        var selector = '[ng-repeat]';

        return this._getParent().children(selector);
      };

      /**
       * @constructor fw.continuousScroll.EndlessScrollerTemplate
       * @param {Object} element The directive element.
       * @param {Object} attrs The directive attributes.
       *
       * @description
       * The template of endlessScroll directive.
       */
      function EndlessScrollerTemplate( element, attrs ) {
        this.html = this._create(element, attrs);
      }

      /**
       * @function fw.continuousScroll.EndlessScrollerTemplate#toString
       * @returns {String} The template element as HTML string
       */
      EndlessScrollerTemplate.prototype.toString = function() {
        return this.html;
      };

      /**
       * @function fw.continuousScroll.EndlessScrollerTemplate#_create
       * @param element {Object}
       * @param attrs {Object}
       * @returns {String} The template element as HTML string
       *
       * @description
       * Create a template element for the directive.
       */
      EndlessScrollerTemplate.prototype._create = function _create( element, attrs ) {
        var elementAttrs = Array.prototype.slice.call(element.prop('attributes'), 0),
            parsedExp    = parseNgRepeatExp(attrs.continuousScroll),
            ngRepeatExp  = parsedExp.item + ' in _endlessScroll.items' + (parsedExp.trackBy ? ' ' + parsedExp.trackBy : '');

        // Remove all element attributes as 'replace' already copies over these attributes
        angular.forEach(elementAttrs, function( attr ) {
          element.removeAttr(attr.name);
        });

        // Retain reference to the original repeat expression
        element.attr('ng-repeat', ngRepeatExp);

        return element.prop('outerHTML');
      };

      return {
        restrict: 'A',
        scope: true,
        replace: true,

        template: function( element, attrs ) {
          return (new EndlessScrollerTemplate(element, attrs)).toString();
        },

        controller: function( $scope, $element, $attrs ) {
          var endlessScroll = new EndlessScroller($scope, $element, $attrs);

          $scope._endlessScroll = endlessScroll;

          return endlessScroll;
        }
      };
    });
})();

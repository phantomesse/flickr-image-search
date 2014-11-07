var Cache = function() {
  this.request = {};
  
  this.page = 0;
  this.total_pages = 0;

  this.photos = []; // Cached photo objects that have not been displayed yet
};

/**
 * Requests next page of images from the Flickr API.
 * Returns a deferred object with nothing in it.
 * Auto populates the photo array with more photos.
 */
Cache.prototype.requestNextPage = function() {
  var deferred = $.Deferred();

  // Check if we're on the last page
  if (this.page === this.total_pages) {
    // There aren't any more pages to get
    deferred.resolve();
  } else {
    // We're not on the last page, so get the next page
    request.page = page + 1;
    flickr.photos.search(request, function(error, result) {
      if (error) {
        // There's an error, so let's just swallow it
        console.log(error);
        deferred.resolve();
      } else {
        // Add search result to cache
        this.addResult(this.request, result);
      }
    });
  }

  return deferred.promise();
};

/**
 * Parses a Flickr result into cache.
 */
Cache.prototype.addResult = function(request, result) {
  this.request = request;

  this.page = result.photos.page;
  this.total_pages = result.photos.pages;

  for (var i = 0; i < result.photos.photo.length; i++) {
    var photo = new Photo(result.photos.photo[i]);
    this.photos.push(photo);
  }
};

/**
 * Clear the cache.
 */
Cache.prototype.clear = function() {
  this.request = {};
  this.page = 0;
  this.total_pages = 0;
  this.photos = [];
};

/**
 * Returns the next given number of photos and removes them from the array.
 * If the number of photos that we want exceeds the number of photos that we have,
 * try to request a new page first. If we're on the last page, just return the remaining photos.
 * Returns a deferred object.
 */
Cache.prototype.popNextPhotos = function(number_of_photos) {
  var deferred = $.Deferred();

  var photos_to_return = [];

  // Check if the photos array has this many photos
  if (number_of_photos > this.photos.length) {
    var self = this;

    // Request for next page
    this.requestNextPage().done(function() {

      if (number_of_photos > self.photos.length) {
        // Just return last photos
        photos_to_return = self.photos;
        self.photos = [];
      } else {
        // Return only the number of photos to return
        for (var i = 0; i < number_of_photos; i++) {
          photos_to_return.push(self.photos.shift());
        }
      }

      deferred.resolve(photos_to_return);

    });
  } else {
    // Return only the number of photos to return
    for (var i = 0; i < number_of_photos; i++) {
      photos_to_return.push(this.photos.shift());
    }

    deferred.resolve(photos_to_return);
  }

  return deferred.promise();
};

var Photo = function(flickr_photo) {
  this.title = flickr_photo.title;
  this.date = new Date(flickr_photo.dateupload*1000);

  this.thumbnail_url = flickr_photo.url_s;
  this.thumbnail_width = flickr_photo.width_s;
  this.image_url = flickr_photo.hasOwnProperty('url_o')? flickr_photo.url_o : 'https://farm' + flickr_photo.farm + '.staticflickr.com/' + flickr_photo.server + '/' + flickr_photo.id + '_' + flickr_photo.secret + '.jpg';
  this.image_page_url = 'https://www.flickr.com/photos/' + flickr_photo.owner + '/' + flickr_photo.id;

  this.owner = flickr_photo.ownername;
  this.owner_url = 'https://www.flickr.com/people/' + flickr_photo.owner + '/';
  this.owner_buddy_icon_url = 'http://farm' + flickr_photo.iconfarm + '.staticflickr.com/' + flickr_photo.iconserver + '/buddyicons/' + flickr_photo.owner + '.jpg';
};

/**
 * Returns an HTML figure element for this photo in a deferred. The deferred is for the image to load so that isotope can handle it.
 */
Photo.prototype.createElement = function() {
  var deferred = $.Deferred();

  var thumbnail = $('<img src="'+ this.thumbnail_url +'">');

  var self = this;
  thumbnail.load(function() {
    var figure = $('<figure>').addClass('search-result')
                              .css('width', self.thumbnail_width + 'px');

    var month = self.date.getMonth() + 1;
    month = (month < 10 ? '0' : '') +  month;
    var day = self.date.getDate();
    day = (day < 10 ? '0' : '') + day;

    var date_str = month + '/' + day + '/' + self.date.getFullYear();
    $('<a>').addClass('image')
            .attr('href', self.image_url)
            .attr('target', '_blank')
            .css({
              'width' : thumbnail[0].width + 'px',
              'height' : thumbnail[0].height + 'px'
            })
            .append(thumbnail)
            .append('<span class="date">' + date_str + '</span>')
            .appendTo(figure);

    $('<figcaption>').html('<a class="title" target="_blank" href="' + self.image_page_url + '">' + self.title + '</a><a class="owner" target="_blank" href="' + self.owner_url + '"><img src="' + self.owner_buddy_icon_url + '" onerror="showDefaultBuddyIcon(this)" /><span>' + self.owner + '</span></a>').appendTo(figure);
    deferred.resolve(figure);
  });
  
  return deferred.promise();
};

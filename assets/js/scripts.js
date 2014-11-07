/** Page size for requesting results */
var REQUEST_PAGE_SIZE = 150;

/** Page size for displaying on the page */
var DISPLAY_PAGE_SIZE = 10;

/** Different search types */
var SEARCH_TYPES = ['text', 'user_id', 'min_upload_date', 'max_upload_date'];

/** Flickr object for making Flickr API requests */
var flickr = new Flickr({
  api_key: "236f5a995bc730e9cf016755b776702c"
});

/** Cache object for caching search results */
var cache = new Cache();

/** Isotope for masonry for the search results */
var iso;
var isotope_elements = [];

$(document).ready(function() {
  // Initiate the masonry for the search results
  iso = $('#search-results').isotope({
    itemSelector: '.search-result',
    masonry: {
      columnWidth: 10,
      isFitWidth: true
    }
  });

  // Force isotope to relayout on resize
  $(window).on('resize', function() {
    $('#search-results').isotope('layout');
  });

  $(window).on('scroll', function() {
    // Make loading bar sticky when the scroll is beyond the form
    if ($('body').hasClass('results-view')) {
      if ($(this).scrollTop() >= 78) {
        if (!$('#search-loading-bar').hasClass('sticky')) {
          $('#search-loading-bar').addClass('sticky');
        }
      } else {
        if ($('#search-loading-bar').hasClass('sticky')) {
          $('#search-loading-bar').removeClass('sticky');
        }
      }
    }

    // Don't show the get more results button until the scroll is at or near the bottom of the page
    toggleResultsMoreButtonVisibility();
  });

  // By default, focus on query
  $('#search-query').focus();

  // By default, hide search results and search results error message
  $('#search-results').hide();
  $('#search-results-error-message').hide();
  $('#search-results-more-button').hide();

  // Hide all clear input buttons
  $('.search-clear-input').hide();

  // Handle clear input buttons
  $('.search-clear-input').on('click', function() {
    var input_id = $(this).attr('id');
    input_id = '#' + input_id.substring(0, input_id.indexOf('-clear'));
    $(input_id).val('').addClass('hide-label');
    $(this).fadeOut();
  });

  // Exit from results view by clicking on h1
  $('#search-form h1').on('click', function() {
    // Remove the results view class
    if ($('body').hasClass('results-view')) {
      $('body').removeClass('results-view');
    }

    // Hide the search results and search results error message
    $('#search-results').hide();
    $('#search-results-error-message').hide();

    // Hide the load more bar
    $('#search-results-more-button').hide();

    // Clear all inputs
    $('input').each(function() {
      $(this).val('');
      if ($(this).hasClass('error')) {
        $(this).removeClass('error');
      }
      if (!$(this).hasClass('hide-label')) {
        $(this).addClass('hide-label');
      }
    }).promise().done(function() {
      // Focus on query
      $('#search-query').focus();
    });
  });

  // Handle toggling of labels
  $('input').on('focus', function() {
    if ($(this).hasClass('hide-label')) {
      $(this).removeClass('hide-label');
    }
  }).on('focusout', function() {
    // If there's a value in the input, don't remove the label
    if ($(this).val().length > 0) {
      return;
    }

    if (!$(this).hasClass('hide-label')) {
      $(this).addClass('hide-label');
    }
  });

  // Handle input for username
  $('#search-username').on('focus', function() {
    $(this).attr('placeholder', 'username');
  }).on('focusout', function() {
    $(this).attr('placeholder', 'All Users');
  });

  // Handle input for min upload date
  $('#search-min-upload-date').on('focus', function() {
    $(this).attr('placeholder', 'mm/dd/yyyy');
  }).on('focusout', function() {
    $(this).attr('placeholder', 'Beginning of Time');
  }).on('keyup', function(e) {
    if (e.keyCode != 8) { // Do not handle input on backspace
      handleDateInput($(this));
    }
  });

  // Handle input for max upload date
  $('#search-max-upload-date').on('focus', function() {
    $(this).attr('placeholder', 'mm/dd/yyyy');
  }).on('focusout', function() {
    $(this).attr('placeholder', 'Today');
  }).on('keyup', function(e) {
    if (e.keyCode != 8) { // Do not handle input on backspace
      handleDateInput($(this));
    }
  });

  // Handle actions that happen when something is typed into an input
  $('input').on('keyup', function(e) {
    // Hide the error message if an input has been changed
    if (e.keyCode != 13 && $(this).hasClass('error')) {
      $(this).removeClass('error');
    }

    // Handle the disabling / enabling of the submit button
    // based on whether at least one input is filled out
    $('#search-submit')[0].disabled = true;
    $('input').each(function() {
      // Toggle clear input button
      var clear_input_button = $('#' + $(this).attr('id') + '-clear');
      
      if ($(this).val().trim().length > 0) {
        $('#search-submit')[0].disabled = false;
        clear_input_button.show();
      } else {
        clear_input_button.hide();
      }

    });
  });

  // Handle submit for search form
  $('#search-form').on('submit', function() {
    // Clear the cache
    cache.clear();

    // Set the progess bar to 0
    $('#search-loading-bar').show();
    updateProgressBar(0);

    // Clear the search results
    if ($('.search-result').length > 0) {
      $('#search-results').empty();
      $('#search-results').isotope('layout');
    }

    // Hide load results
    $('#search-results-more-button').hide();

    // Build a JSON from the search form inputs
    var request = {};
    $('input').each(function() {
      var name = $(this).attr('name');
      var value = $(this).val().trim();
      if (value.length > 0) {
        request[name] = value;
      }
    }).promise().done(function() {
      // Update progess
      updateProgressBar(10);

      // Validate the request (get user id for username, check if dates are valid)
      validateRequest(request).done(function(validated_request) {
        // Update progess
        updateProgressBar(20);

        // Send the request JSON to the search function to execute search
        search(validated_request);
        return false;
      }).fail(function() {
        // Do not execute a search if the request failed validation

        // Update progess
        updateProgressBar(0);
      });
    });

    return false;
  });

  // Hand load more results button
  $('#search-results-more-button').on('click', function() {
    // Set the progess bar to 0
    $('#search-loading-bar').show();
    updateProgressBar(0);

    displaySomeResults();
  });

});

/**
 * Validates a request and handles errors by displaying them as error messages over the inputs.
 * Retrieves the user id from username if necessary.
 * Makes sure that min upload date and max upload date are valid.
 * Makes sure that max upload date is after min upload date.
 * Rejects if there's an error.
 */
function validateRequest(request) {
  var deferred = $.Deferred();
  var validated_request = {};
  var response;

  // Transfer request.text to validated_request.text if necessary
  if (request.hasOwnProperty('text')) {
    validated_request.text = request.text;
  }

  // Parse min upload date if necessary
  if (request.hasOwnProperty('min_upload_date')) {
    // Attempt to parse the date
    response = parseDate(request.min_upload_date);
    if (response.error) {
      handleInputError('#search-min-upload-date', response.error);
      deferred.reject();
    } else {
      validated_request.min_upload_date = response.result.getTime() / 1000;
    }
  }

  // Parse max upload date if necessary
  if (request.hasOwnProperty('max_upload_date')) {
    // Attempt to parse the date
    response = parseDate(request.max_upload_date);
    if (response.error) {
      handleInputError('#search-max-upload-date', response.error);
      deferred.reject();
    } else {
      var max_upload_date = response.result.getTime() / 1000;

      // Make sure that the max upload date is after the min upload date if the min upload date exists
      if (validated_request.hasOwnProperty('min_upload_date')) {
        if (max_upload_date < validated_request.min_upload_date) {
          handleInputError('#search-max-upload-date', 'Max upload date is before min upload date');
          deferred.reject();
        } else {
          validated_request.max_upload_date = max_upload_date;
        }
      } else {
        validated_request.max_upload_date = max_upload_date;
      }
    }
  }  

  // Get user id from username if necessary
  if (request.hasOwnProperty('username')) {
    // Attempt to get the user id from the username using the Flickr API
    flickr.people.findByUsername({
      username: request.username
    }, function(error, result) {
      if (error) {
        handleInputError('#search-username', error);
        deferred.reject();
      } else {
        validated_request.user_id = result.user.id;

        deferred.resolve(validated_request);
      }
    });
  } else {
    deferred.resolve(validated_request);
  }

  return deferred.promise();
}

/**
 * Performs a search request.
 */
function search(request) {
  // By default, hide search results and search results error message
  $('#search-results').hide();
  $('#search-results-error-message').hide();
  $('#search-results-more-button').hide();

  // Add per page to request
  request.per_page = REQUEST_PAGE_SIZE;

  // Add extra fields to make our lives easier
  request.extras = 'date_upload,owner_name,icon_server,url_s,url_o';

  // Switch to results view
  if (!$('body').hasClass('results-view')) {
    $('body').addClass('results-view');
  }

  // Make the call to the Flickr API
  flickr.photos.search(request, function(error, result) {
    if (error) {
      // There was an error, so display an error message
      $('#search-results-error-message span').text('Error: ' + error);
      $('#search-results-error-message').fadeIn();

      // Update progess
      updateProgressBar(0);
    } else {
      // Check if there are any results
      if (result.photos.pages === 0) {
        // There are no results, so display an error message
        $('#search-results-error-message span').text('There are no results!');
        $('#search-results-error-message').fadeIn();

        // Update progess
        updateProgressBar(0);
      } else {
        // Update progess
        updateProgressBar(40);

        // Add search result to cache
        cache.addResult(request, result);

        // Unhide the search results div
        $('#search-results').show();

        // Display the results
        displaySomeResults();
      }
    }
  });
}

/**
 * Displays the next few results in the cache.
 */
function displaySomeResults() {
  toggleResultsMoreButtonVisibility();

  cache.popNextPhotos(DISPLAY_PAGE_SIZE).done(function(photos) {
    // Check if there are any photos left
    if (cache.photos.length === 0) {
      // No photos left, so hide the load more button
      if ($('#search-results-more-button').is(':visible')) {
        $('#search-results-more-button').fadeOut();
      }
    } else {
      if (!$('#search-results-more-button').is(':visible')) {
        $('#search-results-more-button').fadeIn();
      }
    }

    // Append the photos
    appendResult(0, photos);
  });

  function appendResult(index, photos) {
    if (index === photos.length) {
      // Update progess
      updateProgressBar(100);

      // Fade progress bar
      $('#search-loading-bar').fadeOut(2000);
      return;
    }

    // Update progess
    updateProgressBar(40 + (index * 60)/photos.length);

    photos[index].createElement().done(function(element) {
      isotope_elements.push(element);
      $('#search-results').append(element).isotope('appended', element).isotope('layout');
      appendResult(index + 1, photos);
    });
  }
}

/**
 * Displays the Flickr default buddy icon if the buddy icon link is broken.
 */
function showDefaultBuddyIcon(image_element) {
  image_element.onerror = '';
  image_element.src = 'https://www.flickr.com/images/buddyicon.gif';
  return true;
}

/**
 * Parses a date string in the format mm/dd/yyyy into a Date object.
 * Returns an object: { error, result }
 * result will be null if there's an error
 */
function parseDate(date_str) {
  // Check if the string has 10 characters
  if (date_str.length != 10) {
    return {
      error: 'Invalid date format',
      result: null
    };
  }

  // Try to split the string into 3 strings by '/'
  var date_array = date_str.split('/');
  if (date_array.length != 3) {
    return {
      error: 'Invalid date format',
      result: null
    };
  }

  // Split the array into month, day, and year
  var month = date_array[0] - 1; // Months are 0 indexed
  var day = date_array[1];
  var year = date_array[2];

  // Create the date object
  var date = new Date(year, month, day);

  // Throw an error if the date is not a valid date
  // Unforunately, this doesn't actually work because the Javascript Date object automatically converts an incorrect date to a correct date
  if (isNaN(date)) {
    return {
      error: 'Date does not exist',
      result: null
    };
  }

  return {
    error: null,
    result: date
  };
}

/**
 * Handles input errors by putting the error in an error message over the input.
 */
function handleInputError(input_id, error) {
  $(input_id).addClass('error');
  $(input_id + '-section .search-error-message').attr('title', error);
}

/**
 * Checks if a date input is correct.
 * Delete the last inputted character if it is not correct.
 * Add a slash if that is the appropriate next character.
 */
function handleDateInput(input) {
  var input_value = input.val();
  var input_value_num;

  switch(input_value.length) {
    case 1:
      input_value_num = parseInt(input_value);

      if (isNaN(input_value_num)) {
        // Invalid input, so delete the inputted character
        input.val('');
        return;
      }

      if (input_value_num > 1) {
        // Add a zero in front of the number automatically and add a slash at the end
        input.val('0' + input_value + '/');
        return;
      }

      return;
    case 2:
      input_value_num = parseInt(input_value.substring(1));
      if (isNaN(input_value_num)) {
        // Invalid input, so delete the last inputted character
        input.val(input_value.substring(0, 1));
        return;
      }

      input_value_num = parseInt(input_value);
      if (input_value_num > 12 || input_value_num < 1) {
        // Input out of bounds, so delete the last inputted character
        input.val(input_value.substring(0, 1));
        return;
      }

      // Everything is all good, so add a slash at the end
      input.val(input_value + '/');
      return;
    case 3:
      input_value_num = parseInt(input_value.charAt(2));

      if (!isNaN(input_value_num)) {
        // User attempted to type a number
        if (input_value_num <= 3) {
          // Insert the number after a slash
          input.val(input_value.substring(0, 2) + '/' + input_value_num);
        } else {
          // Number is greater than 3, so insert a 0 in front of it as well as slashes
          input.val(input_value.substring(0, 2) + '/0' + input_value_num + '/');
        }
        return;
      }

      if (input_value.charAt(2) != '/') {
        input.val(input_value.substring(0, 2) + '/');
      }
      return;
    case 4:
      input_value_num = parseInt(input_value.charAt(3));

      if (isNaN(input_value_num)) {
        // Invalid input, so delete the last inputted character
        input.val(input_value.substring(0, 3));
        return;
      }

      if (input_value_num > 3) {
        // Number is greater than 3, so insert a 0 in front of it and a slash after it
        input.val(input_value.substring(0, 3) + '0' + input_value_num + '/');
      }
      return;
    case 5:
      input_value_num = parseInt(input_value.charAt(4));
      if (isNaN(input_value_num)) {
        // Invalid input, so delete the last inputted character
        input.val(input_value.substring(0, 4));
        return;
      }

      input_value_num = parseInt(input_value.substring(3));
      if (input_value_num > 31 || input_value_num < 1) {
        // Input out of bounds, so delete the last inputted character
        input.val(input_value.substring(0, 4));
        return;
      }

      // Everything is all good, so add a slash at the end
      input.val(input_value + '/');
      return;
    case 6:
      input_value_num = parseInt(input_value.charAt(5));

      if (!isNaN(input_value_num)) {
        // User attempted to type a number, so insert a slash in front of it
        input.val(input_value.substring(0, 5) + '/' + input_value_num);
        return;
      }

      if (input_value.charAt(5) != '/') {
        input.val(input_value.substring(0, 5) + '/');
      }
      return;
  }

  if (input_value.length > 10) {
    // There shouldn't be any more text after this, so remove anything after 10 characters
    input.val(input_value.substring(0, 10));
  }

  // Check if the last inputted character is numeric
  input_value_num = parseInt(input_value.charAt(input_value.length - 1));
  if (isNaN(input_value_num)) {
    // Invalid input, so delete the last inputted character
    input.val(input_value.substring(0, input_value.length - 1));
  }
}

/**
 * Updates the progess bar with the percentage completed.
 */
function updateProgressBar(percentage) {
  $('#search-loading-bar').css('width', percentage + '%');
}

/**
 * Shows or hides the load more results button based on where the scroll is on the page.
 */
function toggleResultsMoreButtonVisibility() {
  if ($(window).scrollTop() + $(window).height() > $(document).height() - 100) {
    if ($('#search-results-more-button').hasClass('hidden')) {
      $('#search-results-more-button').removeClass('hidden');
    }
  } else {
    if (!$('#search-results-more-button').hasClass('hidden')) {
      $('#search-results-more-button').addClass('hidden');
    }
  }
}
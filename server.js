var sys = require('sys');
var http = require('http');
var path = require('path');
var url = require('url');
var fs = require('fs');

http.createServer(function(request, response) {
  // Get the path that has been requested
  var requestedPath = url.parse(request.url).pathname;
  if (requestedPath === '/') {
    requestedPath = '/index.html';
  }
  var requestedFullPath = path.join(process.cwd(), requestedPath);

  // Check if the path exists
  path.exists(requestedFullPath, function(exists) {
    if (exists) {
      fs.readFile(requestedFullPath, "binary", function(error, file) {
        if (error) {
          // There was an error in reading the file from the full path
          response.writeHeader(500, {'Content-Type': 'text/plain'});
          response.write(error + '\n');
          response.end();
        } else {
          // Send out the file
          response.writeHeader(200);
          response.write(file, "binary");
          response.end();
        }
      });
    } else {
      // Path does not exist
      response.writeHeader(404, {'Content-Type': 'text/plain'});
      response.write('404 Not Found\n');
      response.end();
    }
  });

}).listen(8000);

sys.puts('Server running on 8000');
/*
  GMapToGPX 6.4k
  Originally based in part on the "Improved MSN and Google GPS GPX Waypoint 
  Extraction" bookmarklet described at http://badsegue.org/archives/2005/04/21/

  Josh Larios <hades@elsewhere.org>
  August 3, 2005 - February 12, 2014

  WARNING: Highly dependent on internal formats that aren't part of
  the API, so subject to complete breakdown at any time, outside my
  control.

  Gmap-pedometer elevation code courtesy of Mathew O'Brien.

  3/05/2007 - HeyWhatsThat.com code by mk -at- heywhatsthat.com
  10/09/2007 - Allpoints speed improvement by Kyle Yost

  TO DO: Separate out gpx writing and point/track extraction, so I can load
  some array up front regardless of whether it's a google map, a pedometer, 
  heywhatsthat, or whatever, and then just print the damn gpx once.
*/

var error = 0;
var version = '6.4k';
var googledoc = ""; // will hold retrieved google info
var googleurl = "";
var gpxvar = ""; // will hold gHomeVPage structure, even for IE
var routes = new Array();
var polylines = new Array();
var milestones = new Array();
var yelp = new Array();
var googlepage; // Will hold the page element that gets toggled. May change.
var charset;

function fixup (foo) {
    foo = foo.replace(/\\x3e/g, '>');
    foo = foo.replace(/\\x3c/g, '<');
    foo = foo.replace(/\\x26/g, '&');
    foo = foo.replace(/\\x42/g, '"');
    foo = foo.replace(/\\x3d/g, '=');
    
    foo = foo.replace(/\\u003e/g, '>');
    foo = foo.replace(/\\u003c/g, '<');
    foo = foo.replace(/\\u0026/g, '&');
    
    foo = foo.replace(/\\042/g, '"');

    foo = foo.replace(/"*polylines"*:\s*/g, 'polylines:');
    foo = foo.replace(/"*markers"*:\s*/g, 'markers:');
    foo = foo.replace(/"*id"*:\s*/g, 'id:');
    foo = foo.replace(/"*lat"*:\s*/g, 'lat:');
    foo = foo.replace(/"*lng"*:\s*/g, 'lng:');
    foo = foo.replace(/"*laddr"*:\s*/g, 'laddr:');
    foo = foo.replace(/"*points"*:\s*/g, 'points:');
    foo = foo.replace(/\\"/g, '"');
    foo = foo.replace(/\"/g, '\'');

    return foo;
}

function callInProgress (xmlhttp) {
    switch (xmlhttp.readyState) {
    case 1: case 2: case 3:
	return true;
	break;
	// Case 4 and 0
    default:
	return false;
	break;
    }
}

// Synchronous, with an alarm to catch timeouts (30 seconds)
// No idea if this is the best way to do this, but for sure the best way I
// came up with at 3 in the morning.
function loadXMLDoc(url) {
    var req;
    var timeoutid;
    if (window.XMLHttpRequest) {
        req = new XMLHttpRequest();
	showstatusdiv('Loading...');
	timeoutid = window.setTimeout( function(){if(callInProgress(req)){req.abort();}}, 30000);
        req.open("GET", url, false);
        req.send(null);
	window.clearTimeout(timeoutid);
	hidestatusdiv();
    } else if (window.ActiveXObject) {
        req = new ActiveXObject("Microsoft.XMLHTTP");
        if (req) {
	    showstatusdiv('Loading...');
	    timeoutid = window.setTimeout( function(){if(callInProgress(req)){req.abort();}}, 30000);
            req.open("GET", url, false);
            req.send();
	    window.clearTimeout(timeoutid);
            hidestatusdiv();
        }
    }
    
    if (req.readyState == 4) {
        // only if "OK"
        if (req.status == 200) {
            return(req.responseText);
        } else {
	    showstatusdiv('Error ' + req.status + ' getting google data: ' + req.statusText);
	    return('');
        }
    } else {
	showstatusdiv('Error: loadXMLDoc continued with readystate: ' + req.readyState);
	return('');
    }
}


function hidestatusdiv() { 
    var statusbox;
    if (statusbox = document.getElementById("statusbox")) {
	document.body.removeChild(statusbox);
    }
}

function showstatusdiv(boxcontents) {
    hidestatusdiv();
    z=document.body.appendChild(document.createElement("div"));
    z.id = "statusbox";
    z.style.position = "absolute";	
    if (self.pageYOffset != null) {	
	z.style.top = self.pageYOffset + "px";	
    } else if (document.documentElement.scrollTop != null) {
	z.style.top = document.documentElement.scrollTop + "px";	
    }
    z.style.width = "50%";
    z.style.left = "0px";
    z.style.background = "#ffffff";
    z.style.border = ".3em solid #ff0000";
    z.style.padding = ".3em 1.3em .3em .3em";
    z.style.zIndex = "1000";
    
    z.innerHTML = '<div style="position: absolute; border: 1px solid black; top: 0px; right: 0px;"><span style="padding: .3em; font-weight: bold;"><a style="text-decoration: none;" title="Close status box" href="#" onclick="javascript:hidestatusdiv();">X</a></span></div>';
    z.innerHTML += boxcontents;
}

// This function is from Google's polyline utility.
function decodeLine (encoded) {
    var len = encoded.length;
    var index = 0;
    var array = [];
    var lat = 0;
    var lng = 0;
    
    while (index < len) {
	var b;
	var shift = 0;
	var result = 0;
	do {
	    b = encoded.charCodeAt(index++) - 63;
	    result |= (b & 0x1f) << shift;
	    shift += 5;
	} while (b >= 0x20);
	var dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
	lat += dlat;
	
	shift = 0;
	result = 0;
	do {
	    b = encoded.charCodeAt(index++) - 63;
	    result |= (b & 0x1f) << shift;
	    shift += 5;
	} while (b >= 0x20);
	var dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
	lng += dlng;

	array.push({"lat": round(lat * 1e-5), "lon": round(lng * 1e-5)});
    }
    
    return array;
}

function StringBuffer() {
   this.buffer = [];
 }

StringBuffer.prototype.append = function append(string) {
   this.buffer.push(string);
   return this;
 };

StringBuffer.prototype.toString = function toString() {
   return this.buffer.join("");
 };



function gmaptogpxdiv(dtype) { 
    var mypoints = null;
    
    var qtype = 0;
    var subtype = 0;
    
    /* 
       Determine which type of data we're extracting -- a route, or points of
       interest. (Or gmap-pedometer/heywhatsthat.) 
    */
    
    if (gpxvar && gpxvar.overlays && gpxvar.overlays.polylines) {
	qtype = 2;
	
	/* FIXME 
	   errorbox('<p>2008.05.07 - GMapToGPX is currently unable to process driving directions, due to a change in the underlying Google Maps code. I\'m working on it.</p>');
	   closebox();
	   return(0);
	   END FIXME */


	// Load "polylines" up with the decoded polyline segments
	for (i = 0; i < gpxvar.overlays.polylines.length; i++) {
            polylines[i] = decodeLine(gpxvar.overlays.polylines[i].points);
	}
	
	// Stuff the descriptions into the "polylines" array
	if (segmatch = googledoc.match(/<span[^>]*class=.?dirsegtext.?.*?>.*?<\/span>/g)) {
	    for (var s = 0; s < segmatch.length; s++) {
		var route = segmatch[s].replace(/.*dirsegtext_([0-9]+)_([0-9]+).*/, "$1");
		var step = segmatch[s].replace(/.*dirsegtext_([0-9]+)_([0-9]+).*/, "$2");
		var desc = deamp(segmatch[s].replace(/.*?>(.*?)<\/span>.*/, "$1"));
		var polyline = gpxvar.drive.trips[0].routes[route].steps[step].polyline;
		var ppt = gpxvar.drive.trips[0].routes[route].steps[step].ppt;
		polylines[polyline][ppt].desc = deamp(desc);
	    }
	}
    
	// Figure out which polylines go into which routes
	for (i = 0; i < gpxvar.drive.trips[0].routes.length; i++) {
	    var start = gpxvar.drive.trips[0].routes[i].steps[0].polyline;
	    var end = gpxvar.drive.trips[0].routes[i].steps[gpxvar.drive.trips[0].routes[i].steps.length - 1].polyline;
	    var route = "route" + i;
	    routes[route] = new Array();
	    for (n = start; n <= end; n++) {
		routes[route] = routes[route].concat(polylines[n]);
	    }
	}
	
	// Get the milestone descriptions
	var msaddrmatch;
	if (msaddrmatch = gpxvar.panel.match(/<div[^>]*id=.?sxaddr.*?>.*?<\/div>/g)) {
	    for (var i = 0; i < msaddrmatch.length; i++) {
		milestones[parseInt(i)] = deamp(msaddrmatch[i].replace(/<div[^>]*id=.?sxaddr.?.*?><div[^>]+>(.*?)<\/div>/, "$1"));
	    }
	}
	

    } else  if (googledoc.match(/id:'(A|addr)'/)) {
	qtype = 1;
	routes['poi'] = new Array();

	for (var i = 0; i < gpxvar.overlays.markers.length; i++) {
		var desc = gpxvar.overlays.markers[i].laddr;
		desc = desc.replace(/(.*) \((.*)\)/, "$2 ($1)");
		routes['poi'].push({"lat": round(gpxvar.overlays.markers[i].latlng.lat), "lon": round(gpxvar.overlays.markers[i].latlng.lng), "desc": deamp(desc)});
	}
    }
    
    /* gmap-pedometer.com */
if ((document.location.hostname.indexOf('gmap-pedometer') >= 0) && (qtype==0) && (self.o) && (self.o[0])) { 
	qtype = 3; 
    }

    /* Things which work like gmap-pedometer used to. */
    if ( (qtype==0) && (self.gLatLngArray) && (self.gLatLngArray[0]) ) { 
	qtype = 3;
	subtype = 1;
    }

    
    /* HeyWhatsThat.com list of peaks visible from given location */
    if (qtype == 0 && location.href.match(/heywhatsthat.com/i) && peaks && peaks.length) {
	qtype = 4;	
	subtype = 1;
    }

    /* Yelp.com search */
    if (qtype == 0 && location.href.match(/yelp.com/i) && document.body.innerHTML.match('result_plot_obj.map.addOverlay')) {
	qtype = 4;
	subtype = 2;
	var yelpmatch = document.body.innerHTML.match(/result_plot_obj.map.addOverlay.*?\)\)/g);
	for (var i = 0; i < yelpmatch.length; i++) {	
	    yelp[i] = new Array();
	    yelp[i].name = deamp(yelpmatch[i].replace(/.*<h3>(.*?)<\/h3>.*/, "$1"));
	    yelp[i].addr = deamp(yelpmatch[i].replace(/.*<address[^>]*>(.*?)<\/address>.*/, "$1"));
	    yelp[i].lon = yelpmatch[i].replace(/.*Yelp.TSRUrl.*?,.*?,.*?, (.*?),.*/, "$1");
	    yelp[i].lat = yelpmatch[i].replace(/.*Yelp.TSRUrl.*?,.*?,.*?,.*?, (.*?),.*/, "$1");
	}
    }
    /* Yelp.com single location */
    //    var json_biz = {"city":"Seattle","zip":"98102","review_count":6,"name":"Tacos Guaymas - CLOSED","neighborhoods":["Capitol Hill"],"photos":[],"address1":"213 Broadway East","avg_rating":4.000000,"longitude":-122.320999,"address2":null,"phone":"(206) 860-7345","state":"WA","latitude":47.620201,"id":"PidHplYWockrwJpijqUwsg","categories":{}};
    if (qtype == 0 && location.href.match(/yelp.com/i) && json_biz) {
	qtype = 4;
	subtype = 2;
	yelp[0] = new Array();
	yelp[0].name = json_biz.name;
	yelp[0].lat = json_biz.latitude;
	yelp[0].lon = json_biz.longitude;
	yelp[0].addr = json_biz.address1 + ", ";
	if (json_biz.address2 != null) {
	    yelp[0].addr += json_biz.address2 + ", ";
	}
	yelp[0].addr += json_biz.city + ", " + json_biz.state + " " + json_biz.zip;
    }

    /* findmespot.com */
    if (qtype == 0 && location.href.match(/findmespot.com/i) && document.getElementsByTagName('iframe')[1] && document.getElementsByTagName('iframe')[1].contentDocument.getElementById('mapForm:inputHidden1').value) {
	qtype = 4;
	subtype = 3;
    }

   /* logyourrun.com */
   if (qtype == 0 && location.href.match(/logyourrun.com/i) && route_polyline) {
	qtype = 4;
	subtype =  4;
   }

    if (qtype==0) {
	errorbox('<p>There doesn\'t seem to be any extractable data on this page.</p><p>If there is, but it\'s not detected, please visit the <a href="http://www.elsewhere.org/GMapToGPX/">project homepage</a> and leave a bug report, including a link to the page you\'re on right now.</p><p><strong>Note:</strong> Google Maps mashups (that is, a page with a Google Map on it, but not at google.com) do not automatically work with this utility. If you would like to see GMapToGPX work with a Google Maps mashup site you maintain, please leave a comment on the project page.</p>');
	closebox();
	return(0); 
    }


    /* t contains the text that will be injected into a <div> overlay */
    var t="<div style='border:3px dotted orange;padding:2px;background-color:#FFFFFF;margin-left:auto;margin-right:auto;'>";
    
    if (navigator.userAgent.match(/Safari/)) {
	t+='\
<style type="text/css">\
.menubar ul {\
	margin:0; \
}\
.menubar li {\
	display:inline;\
	list-style:none;\
	margin:0 5px 0 5px;\
}\
\
.menubar a , .menubar a:visited {\
	padding: 1px 10px 1px 10px;\
	text-decoration:none;\
        background-color: #3399CC;\
	color:white;\
	font-family:Verdana, Sans-Serif;\
	font-size:9pt;\
	-moz-border-radius:10px;\
	border:2px inset black;\
	font-weight: bolder;\
}\
\
.menubar select {\
    background-color: transparent;\
    color: #333333;\
    margin-top: 2px;\
    border: 1px solid #efefef;\
}\
\
.menubar a:hover , .menubar select:hover {\
	border:2px outset black;\
   	background-color:white;\
	color:blue;\
	text-decoration:none;\
}\
</style>\
';
    }
	
    
    t+="<div style='background-color:gray;'>";
    t+='<ul class="menubar">';
    t+='<li class="menubar">GMapToGPX v' + version + '</li>';
    if ((qtype > 1) && (qtype != 4)) {
	if (dtype != "route") {
	    t+='<li class="menubar"><a href="javascript:reload(0)" title="Turn points as a route">Route</a></li>'; 
	} 
	if (dtype != "track") {
	    t+='<li class="menubar"><a href="javascript:reload(1)" title="Turn points as a track">Track</a></li>';
	}
	if (dtype != "points") {
	    t+='<li class="menubar"><a href="javascript:reload(2)" title="Turn points as waypoints">Points</a></li>';
	}
	if ((qtype ==2) && (dtype != "allpoints")) {
	    t+='<li class="menubar"><a href="javascript:reload(3)" title="ALL points as a track (potentially very large)">Full</a></li>';
	}
    }
    t+='<li class="menubar"><a href="javascript:loadabout()">About</a></li>';
    t+='<li class="menubar"><a href="javascript:closebox()">CLOSE [X]</a></li></ul></div>';
    t+='<textarea rows="20" cols="60">';
    
    /* This part of the GPX is going to be the same no matter what. */
    t+= '<?xml version="1.0" encoding="' + charset + '" ?>\n' + 
	'<gpx version="1.1"\n' + 
	'     creator="GMapToGPX ' + version + ' - http://www.elsewhere.org/GMapToGPX/"\n' + 
	'     xmlns="http://www.topografix.com/GPX/1/1"\n' + 
	'     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n' + 
	'     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">\n';

    if ((qtype==2) && (dtype=="allpoints")) {
	var title = "Driving directions";
	t+= '   <trk>\n';
	t+= '      <name>Google Driving Directions Track</name>\n';
	var buf = new StringBuffer;
	for (var key in routes) {
	    var route = routes[key];
	    buf.append("      <trkseg>\n");
	    for(i=0;i<route.length;i++) {
		if (i == route.length - 1) {
		    route[i].desc = milestones[1 + parseInt(key.replace(/route/,''))];
		} else if ((route[i].lat == route[i+1].lat) && (route[i].lon ==
								route[i+1].lon)) {
		    continue;
		}
		buf.append("      <trkpt lat=\"");
		buf.append(route[i].lat);
		buf.append("\" lon=\"");
		buf.append(route[i].lon);
		buf.append("\">");
		if (route[i].desc) {
		    buf.append("<cmt>");
		    buf.append(deamp(route[i].desc));
		    buf.append("</cmt>");
		}
		buf.append("</trkpt>\n");
	    }
	    buf.append("      </trkseg>\n");
	}
	buf.append("   </trk>\n");
	t+= buf.toString();

    } else if (qtype == 3) {
//	var pl = location.href + returnPermalinkString();
	var pl = "";
	if (self.O && (self.O.length > 0)) {
	    pl = "http://www.gmap-pedometer.com/?r=" + self.O;
	} else {
	    pl = "Permalink unavailable.";
    	}
//	New array variables after obfuscation. --RJL20
	if ( subtype == 0 ) {
		var elevationArray = A;
		var gLatLngArray = o;
	} else {
		var elevationArray = [];
		var gLatLngArray = self.gLatLngArray;
	}
	var elevationArrayTested = true;                
	// 1st make sure that the gmap elevation array is the same length as 
	// the LatLng array
	if ( (typeof(elevationArray) != 'undefined') && (gLatLngArray.length == elevationArray.length) ) {
	    // Next test all of the elevation data in the array, looking for 
	    // bad elevation data
	    // -1.79769313486231E+308 means no valid elevation value was 
	    // found at that point
	    for (var e =0;e<elevationArray.length;e++){
		if (elevationArray[e] == "-1.79769313486231E+308") 
		    {
			elevationArrayTested = false;
		    }
	    }
	} else {
	    elevationArrayTested = false;
	}

	if (dtype == "track") {
	    t+= '   <trk>\n';
	    t+= '      <name>Gmaps Pedometer Track</name>\n' +
		'      <cmt>Permalink: &lt;![CDATA[\n' + pl + '\n]]>\n</cmt>\n';
	    t+= '      <trkseg>\n';
	} else if (dtype == "route") {
	    t+= '   <rte>\n';
	    t+= '      <name>Gmaps Pedometer Route</name>\n' +
		'      <cmt>Permalink: &lt;![CDATA[\n' + pl + '\n]]>\n</cmt>\n';
	}
	for(var i=0;i<gLatLngArray.length;i++){
	    if (dtype == "track") {
		t+= '      <trkpt ';
	    } else if (dtype == "route") {
		t+= '      <rtept ';
	    } else if (dtype == "points") {
		t+= '      <wpt ';
	    }
	    t+= 'lat="' + round(gLatLngArray[i].y) + '" ' +
		'lon="' + round(gLatLngArray[i].x) + '">\n';


	    if ( elevationArrayTested == true ) {
		var currentElevation = 0;
		currentElevation = elevationArray[i];              
		currentElevation = round(currentElevation * 0.3048)     
		    t+= '         <ele>' + currentElevation  + '</ele>\n';
	    }

	    t+= '         <name>' + (i ? 'Turn ' + i : 'Start') + '</name>\n';

	    if (dtype == "track") {
		t+= '      </trkpt>\n';
	    } else if (dtype == "route") {
		t+= '      </rtept>\n';
	    } else if (dtype == "points") {
		t+= '      </wpt>\n';
	    }
	}
	if (dtype == "track") {
	    t+= '      </trkseg>\n';
	    t+= '   </trk>\n';
	} else if (dtype == "route") {
	    t+= '   </rte>\n';
	}
    } else if (qtype == 4 && subtype == 1) {
	/* HeyWhatsThat.com list of peaks */
	for (var i = 0; i < peaks.length; i++) {
	    var p = peaks[i];
	    t+= '   <wpt lat="' + p.lat + '" lon="' + p.lon + '">\n' +
		'      <ele>' + p.elev + '</ele>\n' +
		'      <name>' + p.name + '</name>\n' +
		'      <cmt>' + p.name + '</cmt>\n' +
		'   </wpt>\n';
	}
    } else if (qtype == 4 && subtype == 2) {
	for (var i = 0; i < yelp.length; i++) {
	    var p = yelp[i];
	    t+= '   <wpt lat="' + p.lat + '" lon="' + p.lon + '">\n' +
		'      <name>' + p.name + '</name>\n' +
		'      <cmt>' + p.addr + '</cmt>\n' +
		'   </wpt>\n';
	}
    } else if (qtype == 4 && subtype == 3) {
          var spotdata = document.getElementsByTagName('iframe')[1].contentDocument.getElementById('mapForm:inputHidden1').value;
          var loc_array = spotdata.split(",");
          var loc_length = loc_array.length - 1;
	  t += '  <trk><trkseg>\n';
          for(var i=0;i<loc_length;i++){
            var loc_point = loc_array[i].split("||");
            var esn = loc_point[0];
            var lat = loc_point[1];
            var lon = loc_point[2];
            var type = loc_point[3];
            var dtime = loc_point[4];
	    t+= '   <trkpt lat="' + lat + '" lon="' + lon + '">\n' +
		'      <name>' + i + '-' + type + '</name>\n' +
		'      <cmt>' + type + ' ' + esn +  ' @ ' + dtime + '</cmt>\n' +
		'      <desc>' + type + ' ' + esn + ' @ ' + dtime + '</desc>\n' +
		'   </trkpt>\n';
          }
	  t += '  </trkseg></trk>\n';
    } else if (qtype == 4 && subtype == 4) {
	var lyr = decodeLine(route_polyline);
	t += '  <trk><trkseg>\n';
	for (var i = 0; i < lyr.length; i++) {
	    t+= '   <trkpt lat="' + lyr[i].lat + '" lon="' + lyr[i].lon + '">\n' ;
	    t+= '      <name>LYR' + i + '</name>\n' + '   </trkpt>\n';
	}
	t += '  </trkseg></trk>\n';
	
    } else if (qtype == 2) {
	/* If we're on a page with driving directions, spit out a route. */
	var title = "Driving directions";
	
	if (dtype == "track") {
	    t+= '   <trk>\n';
	} 
	
	var turn = 1;
	var milestone = 1;
	
	for (var key in routes) {
	    var route = routes[key];
	    var routeno = key.replace(/route/, '');
	    routeno = parseInt(routeno);
	    if (dtype == "track") {
		t+= '   <trkseg>\n';
	    } else if (dtype == "route") {
		t+= '   <rte>\n';
	    }
	    
	    if ((dtype=="track") || (dtype=="route")) {
		t+= '      <name>' + key + '</name>\n';
		t+= '      <cmt>' + milestones[routeno] + " to " + milestones[routeno + 1] + '</cmt>\n'; 
		t+= '      <desc>' + milestones[routeno] + " to " + milestones[routeno + 1] + '</desc>\n'; 
	    }

	    for(i=0;i<route.length;i++){	
		if ((i != route.length - 1) && (route[i].desc == undefined)) {
		    continue;
		} 
		// Only print turn points and milestones (last point is an
		// undescribed milestone; first point should always have a
		// description).
		switch(dtype) {
		case 'track':
		    t+= '      <trkpt ';
		    break;
		case 'route':
		    t+= '      <rtept ';
		    break;
		case 'points':
		    t+= '      <wpt ';
		    break;
		}
		t+= 'lat="' + route[i].lat + '" ' +
		    'lon="' + route[i].lon + '">\n' +
		    '         <name>';
		if (i == route.length - 1) {
		    route[i].desc = milestones[routeno+1];

		    t += 'GMLS-' + ((milestone < 100) ? '0' : '') + 
			((milestone < 10) ? '0' : '') + milestone;
		    milestone += 1;
		    turn -= 1;
		} else {
		    t += 'GRTP-' + ((turn < 100) ? '0' : '') + 
			((turn < 10) ? '0' : '') + turn;
		}
		t += '</name>\n' +
		    '         <cmt>' + route[i].desc + '</cmt>\n' +
		    '         <desc>' + route[i].desc + '</desc>\n';

		switch(dtype) {
		case 'track':
		    t+= '      </trkpt>\n';
		    break;
		case 'route':
		    t+= '      </rtept>\n';
		    break;
		case 'points':
		    t+= '      </wpt>\n';
		    break;
		}
		turn++;
	    }
	    if (dtype == "track") {
		t+= '   </trkseg>\n';
	    } else if (dtype == "route") {
		t+= '   </rte>\n';
	    }
	}
	
	if (dtype == "track") {
	    t+= '   </trk>\n';
	} 
	
    } else if (qtype == 1) {
	/* This is a page with points of interest - spit out waypoints. */
	for(i=0;i<routes['poi'].length;i++){
	    var point = routes['poi'][i];
	    t+= '   <wpt lat="' + point.lat + '" lon="' + point.lon + '">\n' +
		'      <name>' + point.desc + '</name>\n' +
		'      <cmt>' + point.desc.replace(/(.*) \((.*)\)/, "$2 ($1)") + '</cmt>\n' +
		'      <desc>' + point.desc.replace(/(.*) \((.*)\)/, "$2 ($1)") + '</desc>\n' +
		'   </wpt>\n';
	}
    } else {
	errorbox('An unknown error occurred. Please leave a bug report at the <a href="http://www.elsewhere.org/GMapToGPX/">project homepage</a> and include a link to the page you\'re on right now.');
	error = 1;
    }
    
    t+='</gpx>\n';
    t+='</textarea>';
    t+="<div style='background-color:gray;'>";
    t+='<ul class="menubar">';
    t+='<li class="menubar"><a href="javascript:loadabout()">About</a></li>';
    t+='<li class="menubar"><a href="javascript:closebox()">CLOSE [X]</a></li></ul></div></div>';
    displaybox(t);
}


function displaybox(boxcontents) {
    closebox();
    if (googlepage=document.getElementById("page")) {
	googlepage.style.display='none';
    }
    var z=document.body.appendChild(document.createElement("div"));
    z.id = "gpxbox";
    /* I don't know about this stuff; it came from badsegue. */
    z.style.position = "absolute";	
    if (self.pageYOffset != null) {	
	z.style.top = self.pageYOffset + "px";	
    } else if (document.documentElement.scrollTop != null) {
	z.style.top = document.documentElement.scrollTop + "px";	
    }
    z.style.width = "99%";
    z.style.zIndex = "1000";
    z.innerHTML = boxcontents;
}

function closebox() { 
    var gpxbox;
    if (gpxbox = document.getElementById("gpxbox")) {
	document.body.removeChild(gpxbox);
    }
    if (googlepage != undefined) {
	googlepage.style.display='block';
    }
}



function loadabout() {
    var about = '<span style="font-size: x-small;"><p><a href="http://www.elsewhere.org/GMapToGPX/">GMapToGPX</a> Extractor ' + version + '<br />';
    about += 'A project of <a href="http://www.elsewhere.org/">Communications From Elsewhere</a></p>';
    about += '<p>Usage:<ul>';
    about += '<li>"Track" displays driving directions as a GPX track with one or more track segments, depending on the number of milestones in the directions.</li>';
    about += '<li>"Route" displays driving directions as one or more GPX routes.</li>';
    about += '<li>"Full" displays driving directions as a GPX track containing one or more track segments, each of which contains every single point on the line Google Maps draws to represent the segment. Use with caution, as long routes may produce huge results.</li>';
    about += '<li>"Points" displays driving directions as a list of waypoints for each turn in the route. The waypoints will be in order, but this option is mainly intended for devices which can only handle waypoints, not tracks or routes. In most cases, you should use another option.</li>';
    about += '<li>For single or multiple address searches, there are no display options. You get a list of individual waypoints.</li>';
    about += '</ul>If you have questions or comments, please visit the <a href="http://www.elsewhere.org/GMapToGPX/">project homepage</a>.</p></span>';
    showstatusdiv(about);
}

function errorbox(a) {
    var err = '<a href="http://www.elsewhere.org/GMapToGPX/">GMapToGPX</a> v' + version + " (ERROR)<br />" + a;
    showstatusdiv(err);
}


/* Clean up floating point math errors */
function round(a) {
    return parseInt(a*1E+5)/1E+5;
}

function reload(t) {
    closebox();
    if (t==0) {
	gmaptogpxdiv("route");
    } else if (t=="1") {
	gmaptogpxdiv("track");
    } else if (t=="2") {
	gmaptogpxdiv("points");
    } else if (t=="3") {
	gmaptogpxdiv("allpoints");
    }
}



function deamp(a) {
    a = a.replace(/<br *\/>(.+)/g, ", $1");
    a = a.replace(/<br *\/>/g, '');
    a = a.replace(/&#39;/g, '\'');
    a = a.replace(/\\047/g, '\'');
    a = a.replace(/\\042/g, '\"');
    a = a.replace(/&#160;/g, ' ');
    a = a.replace(/<\/*b>/g, '');
    a = a.replace(/<wbr\/*>/g, '');
    a = a.replace(/<div[^>]*?>.*?<\/div>/g, ' ');
    a = a.replace(/\\\'/g, '\''); 
    a = a.replace(/\\\"/g, '\"');
    a = a.replace(/\\x26/g, '&');
    a = a.replace(/&/g, '&amp;');  
    a = a.replace(/&amp;amp;amp;/g, '&amp;amp;');
    a = a.replace(/\\n/g, '');
    a = a.replace(/\\t/g, '');
    a = a.replace(/\s+/g, ' ');
    a = a.replace(/^\s+/, '');
    a = a.replace(/\s+$/, '');
    
    a = a.replace(/<[^>]+>/, ''); // This may be overkill.
    return a;
}
		  

/* main() */
if (document.location.hostname.indexOf('google') >= 0) {

    var kmlurl;
    if ( (kmlurl = document.getElementById('link').href) &&
    (kmlurl.indexOf('msid=') > 0) ) {
    kmlurl = kmlurl + '&output=kml';
    errorbox('This is a "My Maps" page, which means that the original KML used to create it is available. Please <a href="' + kmlurl + '">download the KML file</a> (using this link, not the one provided by Google) and convert it using <a href="http://www.gpsvisualizer.com/convert" target="_new">GPSVisualizer</a>.');
    error = 1;
    }

    if (!error) {
    
	// bar_icon_link is the "link to this page" icon. If they change 
	// its name, I need to fix that here.
	if (googleurl=document.getElementById('link').href) {
	    googleurl = googleurl.replace(/&view=text/, '');
	    googledoc = loadXMLDoc(googleurl);
	    
	    charset=googledoc.slice(googledoc.indexOf('charset='));
	    charset=charset.slice(8, charset.indexOf('"'));
	    
	    // Doing this as a regexp was causing firefox to stall out. bah.
	    var encpointblob=googledoc.slice(googledoc.indexOf('gHomeVPage='));
	    encpointblob=encpointblob.slice(0, encpointblob.indexOf('};') + 2
					    );
	    encpointblob=encpointblob.replace(/gHomeVPage/, "gpxvar");
	    eval(encpointblob);
	    var panel=googledoc.slice(googledoc.indexOf('id="panel_dir"'));
	    panel=panel.slice(0,panel.indexOf('Map data'));
	    gpxvar.panel = panel;
	    googledoc=fixup(googledoc);
	}
    }
}

charset = charset ? charset : "UTF-8";

/* This bit of code was causing Safari to seriously freak out, hence the 
   stylesheet being included above in t, but only for Safari.  */
if (! navigator.userAgent.match(/Safari/)) {
    var styleObject = document.getElementsByTagName("HEAD")[0].appendChild(document.createElement("link"));
    styleObject.rel="Stylesheet";
    styleObject.type="text/css";
    styleObject.href="http://www.elsewhere.org/GMapToGPX/menubar.css";
    styleObject.id="sst_css";
}

if (error != 1) {
/* Default action. If it's not a route, the argument doesn't matter. */
  gmaptogpxdiv("route");
} else {
  closebox();
}


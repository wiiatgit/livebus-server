var app = require('express')();
var http = require('http').Server(app);
var request = require('request-promise');
var io = require('socket.io')(http);
var _ = require('lodash');
var cors = require('cors');
var https = require('https');
var zlib = require("zlib");

app.use(cors());

var config = {
  APPID: process.env.APPID
}

var VEHICLE_URL = 'http://developer.trimet.org/ws/v2/vehicles';

var vehicles = [];
var colors = [
	{color: '#800000', count: 0},
	{color: '#FF0000', count: 0},
	{color: '#FFA500', count: 0},
	{color: '#FFFF00', count: 0},
	{color: '#808000', count: 0},
	{color: '#008000', count: 0},
	{color: '#800080', count: 0},
	{color: '#FF00FF', count: 0},
	{color: '#00FF00', count: 0},
	{color: '#008080', count: 0},
	{color: '#00FFFF', count: 0},
	{color: '#0000FF', count: 0},
	{color: '#000000', count: 0},
	{color: '#C0C0C0', count: 0},
];
var routeColor = [
	// {routeId, color}
];
io.set('origins', '*:*');

/*
function getVehicles() {
  request(VEHICLE_URL, {
    qs: {
      'appID': config.APPID
    }
  }).then(function(data) {
    var json = JSON.parse(data);
    if (json && json.resultSet) {
      vehicles = _.map(json.resultSet.vehicle, function(vehicle) {
        return _.pick(vehicle, ['routeNumber', 'delay', 'inCongestion', 'latitude', 'longitude', 'type', 'vehicleID']);
      });

      io.emit('vehicles_update', vehicles);
    }
  });
}
*/

function getRouteColor(type) {
	var c = _.find(routeColor, function(o) { return o.routeId == type; });
	if (c == null) {
		var tmp = _.sortBy(colors, function (o) { return o.count; });
		routeColor.push({routeId: type, color: tmp[0].color});
		var tmp2 = _.find(colors, function(o) { return o.color == tmp[0].color;});
		tmp2.count += 1;
		return tmp[0].color;
	}else {
		return c.color;
	}
}

function getVehicles() {
  getRouteInfo(function(err, data) {
    if (err) {
      console.log('Error', err);
    }else {
      routes = _.map(data.BusInfo, function(route) {
        return _.pick(route, ['providerId', 'providerName', 'nameZh', 'nameEn', 'pathAttributeId', 'pathAttributeName', 'pathAttributeEName']);
      });
      routeInfo = routes;
    }	
  });

  getBusInfo(function(err, data) {
    if (err) {
      console.log('Error', err);
    }else {
      busInfo = _.map(data.BusInfo, function(bus) {
        var tmp = _.pick(bus, ['BusID', 'CarID', 'CarType', 'Longitude', 'Latitude', 'DutyStatus', 'BusStatus', 'GoBack', 'Speed', 'DataTime', 'RouteID', 'ProviderID']);
        tmp.DutyStatusDesc = getDutyStatus(bus.DutyStatus);
        tmp.BusStatusDesc = getBusStatus(bus.BusStatus);
        tmp.GoBackDesc = getGoBack(bus.GoBack);
        tmp.CarTypeDesc = getCarType(bus.CarType);
        tmp.RouteName = getRouteName(tmp.RouteID);
        tmp.Color = getRouteColor(bus.ProviderID);
        tmp.Type = 'bus';
        return tmp;
      });
      var tmp = _.filter(busInfo, function(o) { return o.DutyStatus == '1' && o.BusStatus == '0'; });
      vehicles = _.map(tmp, function(vehicle) {
        //return _.pick(vehicle, ['routeNumber', 'delay', 'inCongestion', 'latitude', 'longitude', 'type', 'vehicleID']);
        return _.pick(vehicle, ['RouteName', 'delay', 'inCongestion', 'Longitude', 'Latitude', 'CarType', 'BusID', 'Type', 'ProviderID', 'Color']);
      });
      io.emit('vehicles_update', vehicles);
    }
  });

}

setInterval(getVehicles, 5000);

app.get('/', function(req, res){
  res.send(vehicles);
});

io.on('connection', function(socket){

  socket.emit('vehicles_update', vehicles);

});

var IP = process.env.OPENSHIFT_NODEJS_PORT || 3001;
var SERVER = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1';

http.listen(IP, SERVER, function(){
  console.log('listening on ' + SERVER + ':' + IP);
});

//var csvData = '';
var buffer = [];
var bufferRoute = [];
var routeInfo = null;
var busInfo = null;
var options = {
        host :  'tcgbusfs.blob.core.windows.net',
        port : 443,
        path : '/blobbus/GetBUSDATA.gz',
        method : 'GET'
    };
function getRouteInfo(callback) {
	bufferRoute = [];
	var options = {
		host: 'tcgbusfs.blob.core.windows.net',
		post: 443,
		path: '/blobbus/GetRoute.gz',
		method: 'GET'
	};
	var request = https.request(options, function(response) {
			var gunzip = zlib.createGunzip();            
			response.pipe(gunzip);
			gunzip.on('data', function(data) {
					// decompression chunk ready, add it to the buffer
					bufferRoute.push(data.toString())
			}).on("end", function() {
					// response and decompression complete, join the buffer and return
					callback(null, JSON.parse(bufferRoute.join(""))); 
			}).on("error", function(e) {
					callback(e);
			})
	});
	request.end();
}

function getBusInfo(callback) {
	buffer = [];
	var request = https.request(options, function(response) {
			var gunzip = zlib.createGunzip();            
			response.pipe(gunzip);
			gunzip.on('data', function(data) {
					// decompression chunk ready, add it to the buffer
					buffer.push(data.toString())
			}).on("end", function() {
					// response and decompression complete, join the buffer and return
					callback(null, JSON.parse(buffer.join(""))); 
			}).on("error", function(e) {
					callback(e);
			})
			/*
			response.on('data', function(chunk) {
					csvData += chunk;
			});
			response.on('end', function() {
					// prints the full CSV file
					console.log(csvData);
			});
			*/
	});
	request.end();
}

function getRouteName(type) {
	route = _.findIndex(routeInfo, function(o) { return o.pathAttributeId == type; });
	if (route == -1) return null;	
	return routeInfo[route].nameZh;
	//return JSON.parse(routeInfo[route]);
}

function getCarType(type) {
	switch (type) {
		case '0':
			return '一般';
		case '1':
			return '低底盤';
		case '2':
			return '大復康巴士';
		case '3':
			return '圓仔公車';
		default:
			return '未知';
	}
}

function getDutyStatus(type) {
	switch (type) {
		case '0':
			return '正常';
		case '1':
			return '開始';
		case '2':
			return '結束';	
		default:
			return '未知';
	}
}

function getBusStatus(type) {
	switch (type) {
		case '0':
			return '正常';
		case '1':
			return '車禍';
		case '2':
			return '故障';
		case '3':
			return '塞車';
		case '4':
			return '緊急救援';
		case '5':
			return '加油';
		case '99':
			return '非營運狀態';	
		default:
			break;
	}
}

function getGoBack(type) {
	switch (type) {
		case '0':
			return '去程';
		case '1':
			return '返程';	
		default:
			return '未知';
	}
}
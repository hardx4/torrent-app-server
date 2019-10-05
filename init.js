var express = require('express');
var bodyParser = require('body-parser');
var parseTorrent = require('parse-torrent');
var webtorrent = require('webtorrent');
var path = require('path');
var http = require('http');
var rimraf = require('rimraf');
require('events').EventEmitter.defaultMaxListeners = 50;
require("./libs/configReader.js");
require('./libs/logger.js');

var logSystem = 'MAIN';

log('info', logSystem, 'Iniciando...');
//modulos
const mysqlWork = require("./libs/mysql-worker.js");

var app = express();
var client = new webtorrent();
var port = config.server.port;

var pathwin = config.server.WinPath;
var pathlinux = config.server.LinuxPath;
var currentOS = config.server.OSuse; //Alternate in win and linux

if(currentOS == 'win'){
    var path_torrent_default = pathwin+'\\';
}else{
    var path_torrent_default = pathlinux+'/';
}

var store = {};
store.uris = {};
store.lastAccess = {};
store.torrents = {};
store.clients = {};
store.metadata = {};
store.torrentstatus = {};

// Allow Cross-Origin requests
app.use(function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'OPTIONS, POST, GET, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

var buildMagnetURI = function(infoHash) {
    return 'magnet:?xt=urn:btih:' + infoHash + '&tr=udp%3A%2F%2Ftracker.publicbt.com%3A80&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A80&tr=udp%3A%2F%2Ftracker.ccc.de%3A80&tr=udp%3A%2F%2Ftracker.istole.it%3A80&tr=udp%3A%2F%2Fopen.demonii.com%3A1337&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Fexodus.desync.com%3A6969';
};

var myParseTorrent = function(uri, callback) {
	if(typeof uri == 'string' && (uri.substring(0, 7) == 'http://' || uri.substring(0, 8) == 'https://')) {
		parseTorrent.remote(uri, function(err, data) {
			if(err) { callback(false); }
			callback(data.infoHash.toLowerCase());
		});
	} else {
		var parsed = parseTorrent(uri);
		callback(parsed.infoHash.toLowerCase());
	}
};

var removeTorrent = function(ih) {
	var m = buildMagnetURI(ih);
	client.remove(m);
	delete store.uris[ih];
	delete store.torrents[ih];
    delete store.lastAccess[ih];
    delete store.metadata[ih];

    try {
        if(currentOS == "win"){        
            rimraf.sync(pathwin+'\\'+ih);
        }else{
            rimraf.sync(pathlinux+'/'+ih);
        }
    } catch (error) {
        log('error', logSystem+'-rotatesystem', error);       
    }
};

var cleartorrents = setInterval(() => {
    var _time = time();
    var clientscontrol = Object.values(store.clients).join(',');
	Object.keys(store.lastAccess).forEach(function(key) {
		var accessTime = store.lastAccess[key];
		var delay = 60;
		if(_time - accessTime > delay && clientscontrol.indexOf(key) == -1) {
			log('info', logSystem+'-rotatesystem', 'Autoremoving ' + key + ' after ' + delay + ' seconds!');
			removeTorrent(key);
		}
	});
}, 60000);

var time = function() {
	return Math.floor(new Date() / 1000);
};

var gettorrentstatus = async () => {    
    var clienttorrents = client.torrents;    
    if(typeof clienttorrents == "undefined"){
        return ;
    }
    if(clienttorrents.length == 0){
        return ;
    }
    var globalspeed = client.downloadSpeed;    
    var speed_solo_arr = [];

    for(var i = 0; i < clienttorrents.length; i++){
        if(clienttorrents[i].done){
            var speed_solo_obj = {};
            speed_solo_obj.infoHash = clienttorrents[i].infoHash;
            speed_solo_obj.speed = 0;
            speed_solo_obj.downloaded = clienttorrents[i].downloaded;
            speed_solo_obj.total = clienttorrents[i].length;
            speed_solo_obj.remaining = 0;
            speed_solo_obj.progress = 1;
        }else{
            var speed_solo_obj = {};
            speed_solo_obj.infoHash = clienttorrents[i].infoHash;
            speed_solo_obj.speed = clienttorrents[i].downloadSpeed;
            speed_solo_obj.downloaded = clienttorrents[i].downloaded;
            speed_solo_obj.total = clienttorrents[i].length;
            speed_solo_obj.remaining = clienttorrents[i].timeRemaining;
            speed_solo_obj.progress = clienttorrents[i].progress;
        }
        speed_solo_arr.push(speed_solo_obj);
    }
    store.torrentstatus = {global: globalspeed, solo: speed_solo_arr};    
};

/*
var teste = setInterval(() => {
    gettorrentstatus().then(()=>{
        console.log(store.torrentstatus);
    });    
},5000);
*/

function addtorrent(infoHash, callback){        
    if(typeof store.torrents[infoHash] != 'undefined') {		
        store.lastAccess[infoHash] = time();
        callback.sendFile(__dirname + '/public/player.html');            
		return;
    } 
       		        
    uri = buildMagnetURI(infoHash);
    
    mysqlWork.execSQLQuery("SELECT movie_name,movie_thumb,movie_video_index,movie_legenda_index,movie_captions FROM movies WHERE movie_infohash = '"+infoHash+"'",(result) => {
        if(typeof result[0] != "undefined"){
            store.torrents[infoHash] = client.add(uri, {path: path_torrent_default+infoHash}, (torrent) => {
                store.uris[infoHash] = uri;
                store.lastAccess[infoHash] = time();
                store.metadata[infoHash] = result[0];

                torrent.deselect(0, torrent.pieces.length - 1, false);

                var legenda_piece = [
                                    torrent.files[result[0].movie_legenda_index]._startPiece,
                                    torrent.files[result[0].movie_legenda_index]._endPiece
                                    ];
                var video_piece = [
                                    torrent.files[result[0].movie_video_index]._startPiece,
                                    torrent.files[result[0].movie_video_index]._endPiece
                                    ];
                                                                      
                torrent.select(legenda_piece[0],legenda_piece[1],false);
                const stream = torrent.files[result[0].movie_legenda_index].createReadStream({start: 0, end: torrent.files[result[0].movie_legenda_index].length});
                torrent.files[result[0].movie_video_index].select();
                torrent.select(video_piece[0],video_piece[1],false);                

                callback.sendFile(__dirname + '/public/player.html');
            });             
        }else{
            log('error', logSystem, 'Nenhum dado encontrado ou pesquisa falhou!');
            callback.sendFile(__dirname + '/public/player.html');
        }
    })
    .catch(err => log('error', logSystem, err));   
	
}

/**Serve ao usuário o arquivo de socket.io para comunicação */
app.get('/socket.io.js', function(req, res){
    res.sendFile(__dirname + '/node_modules/socket.io-client/dist/socket.io.js');
});

app.get('/player/:infoHash', function(req, res) { 
    addtorrent(req.params.infoHash, res);    
});

app.post('/get/video', function(req, res) {    
    if(typeof req.body.foo == 'undefined' || req.body.foo == ''){
        res.status(500).send('Missing infoHash parameter!'); return;
    }

    var infoHash = req.body.foo;
    if(typeof store.metadata[infoHash] == 'undefined') {
		res.status(404).send('Meta data not found!');
		return;
    }
    
    res.status(200).send(JSON.stringify(store.metadata[infoHash]));
});

app.get('/api/torrent/:infoHash/legenda/:index.srt', function(req, res) {
    if(typeof req.params.infoHash == 'undefined' || req.params.infoHash == '') {
        res.status(500).send('Missing infoHash parameter!'); return;
    }
    var infoHash = req.params.infoHash;
    var index = req.params.index;
    var uri = buildMagnetURI(infoHash);
    if(typeof store.torrents[infoHash] == 'undefined') {
		res.status(404).send('File not found!');
		return;
	}
    try {
        var torrent = client.get(uri);
        if(typeof torrent.files[index] == 'undefined') {
			res.status(404).send('File not found!');
			return;
        } 
        
        var total = 0;
        var loaded = 0;

        var checkcaptions = setInterval(() => {
            var file = torrent.files[index];        
            total = file.length;
            loaded = file.downloaded;

            if(loaded >= total){                
                const { range } = req.headers;
                const size = total;
                const start = Number((range || '').replace(/bytes=/, '').split('-')[0]);
                const end = size - 1;
                const chunksize = total;

                const stream = file.createReadStream({start: start, end: end});
                res.writeHead(200, {			
                    'Accept-Ranges': 'bytes', 
                    'Content-Length': chunksize,			 
                    'Content-Type': 'text/plain; charset=iso-8859-1' 
                });
                stream.pipe(res);
                stream.on('error', (streamErr) => res.end(streamErr));
                clearInterval(checkcaptions);                
            }
        }, 100);        
    } catch (err) {
        res.status(500).send('Error: ' + err.toString());
    }
});

app.get('/api/torrent/:infoHash/download/:index.mp4', function(req, res) {
    if(typeof req.params.infoHash == 'undefined' || req.params.infoHash == '') {
        res.status(500).send('Missing infoHash parameter!'); return;
    }
    var infoHash = req.params.infoHash;
    var index = req.params.index;
    var uri = buildMagnetURI(infoHash);
    if(typeof store.torrents[infoHash] == 'undefined') {
		res.status(404).send('File not found!');
		return;
	}
    try {
        var torrent = client.get(uri);
        if(typeof torrent.files[index] == 'undefined') {
			res.status(404).send('File not found!');
			return;
		}
        var file = torrent.files[index];        
        var total = file.length;

        /*
        const { range } = req.headers;
     	const size = total;
     	const start = Number((range || '').replace(/bytes=/, '').split('-')[0]);
     	const end = size - 1;
        const chunksize = (end - start) + 1;*/        
        
        if(typeof req.headers.range != 'undefined') {
            var range = req.headers.range;
            var parts = range.replace(/bytes=/, "").split("-");
            var partialstart = parts[0];
            var partialend = parts[1];
            var start = parseInt(partialstart, 10);
            var end = partialend ? parseInt(partialend, 10) : total - 1;
            var chunksize = (end - start) + 1;
        } else {
            var start = 0; var end = total; var chunksize = total;
        }
        

        const stream = file.createReadStream({start: start, end: end});
        res.writeHead(206, { 
			'Content-Range': 'bytes ' + start + '-' + end + '/' + total, 
			'Accept-Ranges': 'bytes', 
			'Content-Length': chunksize,			 
			'Content-Type': 'video/mp4' 
		});
        stream.pipe(res);
     	stream.on('error', (streamErr) => res.end(streamErr));
    } catch (err) {
        res.status(500).send('Error: ' + err.toString());
    }
});

app.post('/api/torrent/:infoHash/delete', function(req, res) {
    if(typeof req.params.infoHash == 'undefined' || req.params.infoHash == '') {
        res.status(500).send('Missing infoHash parameter!'); return;
    }
    var infoHash = req.params.infoHash;
    if(typeof store.torrents[infoHash] == 'undefined') {
		res.status(404).send('File not found!');
		return;
	}
    try {
        removeTorrent(infoHash);
        res.status(200).send('Removed file. ');
    } catch (err) {
        res.status(500).send('Error: ' + err.toString());
    }
});

var server = http.createServer(app);
var io = require('socket.io')(server);

var clientside = io
    .of('/client')
    .on('connection', function(socket){
        var handshakeData = socket.request;        
        if(typeof handshakeData._query['foo'] != "undefined"){
            store.clients[socket.id.split('#')[1]] = handshakeData._query['foo'];
        }
        socket.on('disconnect', function(){
            delete store.clients[socket.id.split('#')[1]];
        });
    });

var serverdashboard = io
    .of('/serverdashboard')
    .on('connection', function(socket){       
        
        log('info', logSystem+'-dashboard-monitor', 'Dashboard connected!');

        socket.on('getstatus', function(fn){
            gettorrentstatus().then(()=>{
                fn(JSON.stringify(store.torrentstatus));                
            });            
        });

        socket.on('getclientcount', function(fn){
            gettorrentstatus().then(()=>{
                fn(JSON.stringify(store.clients));                
            });            
        });

        socket.on('disconnect', function(){            
            log('info', logSystem+'-dashboard-monitor', 'Dashboard disconnected!');
        });
    });

server.listen(port, function() {
    log('info', logSystem, 'Listening on http://127.0.0.1:' + port);
});
var express = require('express');
var bodyParser = require('body-parser');
var parseTorrent = require('parse-torrent');
var webtorrent = require('webtorrent');
var path = require('path');
var http = require('http');
require('events').EventEmitter.defaultMaxListeners = 25;


var app = express();
var client = new webtorrent();
var port = 5002;

var store = {};
store.uris = {};
store.lastAccess = {};
store.torrents = {};

// Allow Cross-Origin requests
app.use(function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'OPTIONS, POST, GET, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

console.log(__dirname);

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
};

var time = function() {
	return Math.floor(new Date() / 1000);
};

function addtorrent(infoHash, callback){    
    if(typeof store.torrents[infoHash] != 'undefined') {
		console.log('Added torrent!');
        store.lastAccess[infoHash] = time();
        callback.sendFile(__dirname + '/public/player.html');
		return;
	}    		        
    uri = buildMagnetURI(infoHash);
    store.torrents[infoHash] = client.add(uri, (torrent) => {
        store.uris[infoHash] = uri;
        store.lastAccess[infoHash] = time(); 
        callback.sendFile(__dirname + '/public/player.html');           
    });
	
}

/**Serve ao usuário o arquivo de socket.io para comunicação */
app.get('/socket.io.js', function(req, res){
    res.sendFile(__dirname + '/node_modules/socket.io-client/dist/socket.io.js');
});

app.get('/player/:infoHash', function(req, res) {
    if(req.params.infoHash == 'favicon.ico') {
        res.status(200).send('ok'); return;
    }      
    addtorrent(req.params.infoHash, res);
});

app.get('/api/torrent/:infoHash/keep-alive', function(req, res) {
	if(typeof req.params.infoHash == 'undefined' || req.params.infoHash == '') {
        res.status(500).send('Missing infoHash parameter!'); return;
    }
    var infoHash = req.params.infoHash;
    if(typeof store.torrents[infoHash] == 'undefined') {
		res.status(404).send('Torrent not found!');
		return;
	}
	var _time = time();
	store.lastAccess[infoHash] = _time;
	res.status(200).send(_time.toString());
});

/* EXCLUIR QUANDO ESTIVER NA PRODUÇÃO */
app.get('/api/parse-torrent-test', function(req, res) {
    urii = "magnet:?xt=urn:btih:9C39651ED8952E5FFB9CD624AF512FBAA3691C4D&dn=%5bWWW.BLUDV.TV%5d%20Pets%20-%20A%20Vida%20Secreta%20dos%20Bichos%202%20%202019%20%28720p%20-%20BluRay%29%20%5bDUBLADO%5d%20Acesse%20o%20ORIGINAL%20WWW.BLUDV.TV&tr=udp%3a%2f%2ftracker.openbittorrent.com%3a80%2fannounce&tr=udp%3a%2f%2ftracker.opentrackr.org%3a1337%2fannounce&tr=udp%3a%2f%2f9.rarbg.to%3a2790%2fannounce&tr=udp%3a%2f%2fexplodie.org%3a6969%2fannounce&tr=http%3a%2f%2fglotorrents.pw%3a80%2fannounce&tr=udp%3a%2f%2fp4p.arenabg.com%3a1337%2fannounce&tr=udp%3a%2f%2ftorrent.gresille.org%3a80%2fannounce&tr=udp%3a%2f%2ftracker.aletorrenty.pl%3a2710%2fannounce&tr=udp%3a%2f%2ftracker.coppersurfer.tk%3a6969%2fannounce&tr=udp%3a%2f%2ftracker.piratepublic.com%3a1337%2fannounce";
    myParseTorrent(urii, function(infoHash) {
		if(!infoHash) {
			return res.status(500).send('Error. ');
		}
        res.status(200).send({ infoHash: infoHash });
        uri = buildMagnetURI(infoHash);
        store.torrents[infoHash] = client.add(uri, function (torrent) {
		    store.uris[infoHash] = uri;
			store.lastAccess[infoHash] = time();            
        });
	});
});
/* EXCLUIR QUANDO ESTIVER NA PRODUÇÃO */

app.post('/api/parse-torrent', function(req, res) {
	if(typeof req.body.uri == 'undefined' || req.body.uri == '') {
        res.status(500).send('Missing URI parameter!'); return;
    }
    myParseTorrent(req.body.uri, function(infoHash) {
		if(!infoHash) {
			return res.status(500).send('Error. ');
		}
		res.status(200).send({ infoHash: infoHash });
	});
});

app.post('/api/add-torrent', function(req, res) {
    if(typeof req.body.infoHash == 'undefined' || req.body.infoHash == '') {
        res.status(500).send('Missing infoHash parameter!'); return;
    }
    var infoHash = req.body.infoHash;
    var uri = buildMagnetURI(infoHash);
    if(typeof store.torrents[infoHash] != 'undefined') {
		res.status(200).send('Added torrent!');
		store.lastAccess[infoHash] = time();
		return;
	}
    try {
        store.torrents[infoHash] = client.add(uri, function (torrent) {
			store.uris[infoHash] = uri;
			store.lastAccess[infoHash] = time();
            res.status(200).send('Added torrent!');
        });
    } catch (err) {
        res.status(500).send('Error: ' + err.toString());
    }
});

app.get('/api/torrent/:infoHash/files', function(req, res) {
    if(typeof req.params.infoHash == 'undefined' || req.params.infoHash == '') {
        res.status(500).send('Missing infoHash parameter!'); return;
    }
    var infoHash = req.params.infoHash;
    var uri = buildMagnetURI(infoHash);
    if(typeof store.torrents[infoHash] == 'undefined') {
		res.status(404).send('Torrent not found!');
		return;
	}
    try {
        var torrent = client.get(uri);
        
        var files = [];
        
        for(i = 0; i < torrent.files.length; i++) {
			var file = torrent.files[i];
			files.push({
				index: i,
				name: file.name,
				size: file.length
			});
		}
        
        res.status(200).send({ title: torrent.name, files: files });
    } catch (err) {
        res.status(500).send('Error: ' + err.toString());
    }
});

app.get('/api/torrent/:infoHash/legenda/:index.srt', function(req, res) {
    if(typeof req.params.infoHash == 'undefined' || req.params.infoHash == '') {
        res.status(500).send('Missing infoHash parameter!'); return;
    }
    var infoHash = req.params.infoHash;
    var index = req.params.index;
    var uri = buildMagnetURI(infoHash);
    if(typeof store.torrents[infoHash] == 'undefined') {
		res.status(404).send('Torrent not found!');
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
        }, 500);        
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
		res.status(404).send('Torrent not found!');
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

        
        const { range } = req.headers;
     	const size = total;
     	const start = Number((range || '').replace(/bytes=/, '').split('-')[0]);
     	const end = size - 1;
        const chunksize = (end - start) + 1;
        
        /*
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
        */

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
		res.status(404).send('Torrent not found!');
		return;
	}
    try {
        removeTorrent(infoHash);
        res.status(200).send('Removed torrent. ');
    } catch (err) {
        res.status(500).send('Error: ' + err.toString());
    }
});

var server = http.createServer(app);
var io = require('socket.io')(server);

io.on('connection', function(socket){
    console.log('user connected');
    socket.on('disconnect', function(){
        console.log('user disconnected');
    });
});

server.listen(port, function() {
    console.log('Listening on http://127.0.0.1:' + port);
});
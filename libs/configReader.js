fs = require('fs');
var configFile = 'config.json';

// Read configuration file data
try {
    global.config = JSON.parse(fs.readFileSync(configFile));    
}
catch(e){
    console.error('Failed to read config file ' + configFile + '\n\n' + e);
    return;
}
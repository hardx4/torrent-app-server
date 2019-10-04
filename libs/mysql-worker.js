const mysql = require('mysql');

const moduleName = "mysql_worker";
const logSystem = moduleName+'-module';

log('info', logSystem, 'Modulo %s Carregado: 100%!', [moduleName]);

exports.execSQLQuery = async function(sqlQry, callback){
	const connection = mysql.createConnection({
		host     : config.bdconfig.host,
		port     : config.bdconfig.port,
		user     : config.bdconfig.user,
		password : config.bdconfig.password,
		database : config.bdconfig.database
	});

	await connection.query(sqlQry, function(error, results, fields){
		if(error){			
			return error;
		}else{	
			connection.end();						
			return callback(results);
		}
	});


}
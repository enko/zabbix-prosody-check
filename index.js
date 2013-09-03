var xmpp = require('node-xmpp');
var util = require('util');
var sys = require('sys');
var ZabbixSender = require('zabbix-sender');


var config = require('./config').config;

var start = process.hrtime();

var elapsed_time = function(note){
  var precision = 3; // 3 decimal places
  var elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli
  return elapsed.toFixed(precision);
  start = process.hrtime(); // reset the timer
};

var c = new xmpp.Client({ jid: config.user,
                          password: config.password,
                          host: config.host,
                          port: 5222
                        });


c.on('online', function() {
  if (config.debug) util.log('connected')
  var node = new xmpp.Element('iq', { 
    xmlns:"jabber:client",
    to: config.real_server,
    type: 'set',
    id: 116
  }).c('command', { 
    node : "http://jabber.org/protocol/admin#get-online-users-list",
    xmlns: "http://jabber.org/protocol/commands",
    action: "execute"
  }).up();
  if (config.debug) util.log(node);
  c.send(node);

  // nodejs has nothing left to do and will exit
});

c.on('error', function(e) {
  console.error(e);
  process.exit(1);
});


c.on('stanza',function(stanza){
  if (config.debug) util.log(stanza)
  if (stanza.attrs.type == 'result') {
    var command = stanza.children[0];
    var sessionid = command.attrs.sessionid;
    if (command.attrs.status == 'executing') {
      var node = new xmpp.Element('iq',{
        xmlns:"jabber:client",
        type: 'set',
        to: config.real_server,
        id: 117 
      }).c('command',{
        node : "http://jabber.org/protocol/admin#get-online-users-list",
        xmlns: "http://jabber.org/protocol/commands",
        action: "next",
        sessionid:sessionid
      }).c('x',{
        xmlns:"jabber:x:data",
        type:"submit"
      }).c('field',{
        "var": 'FORM_TYPE'
      }).c('value').t('http://jabber.org/protocol/admin').up().up()
          .c('field',{
            "var": 'max_items'
          })
          .c('value').t('all').up().up()
          .c('field',{
            "var": "details"
          }).c('value').t('false').up().up().up().up();
      if (config.debug) util.log(node);
      c.send(node);
    } else if (command.attrs.status == 'completed') {
      // remove ourself, so we get accurate results
      var count = command.children[0].children[1].children.length - 1;
      var time_elapsed = elapsed_time();
      if (config.debug) util.log([count,time_elapsed]);
      var sender       = new ZabbixSender({
        'hostname' : config.zabbix.hostname,
        'bin' : '/opt/zabbix/bin/zabbix_sender',
        'server': '127.0.0.1'
      });
      sender.send({
        'prosody_users': count,
        'prosody_users_time': time_elapsed
      }, function(err,stdout,stderr) {
        if (err) throw err;
        if (config.debug) util.log(stdout);
        if (config.debug) util.log(stderr);
        if (config.debug) util.log('Wrote keys to zabbix');
        c.end();
      });
    }
  }
});

String.prototype.replaceAll = function (search, replacement) {
    var target = this;
    return target.replace(new RegExp(search, 'g'), replacement);
};

// Application Log
var log4js = require('log4js');
var log4js_extend = require('log4js-extend');
log4js_extend(log4js, {
    path: __dirname,
    format: '(@file:@line:@column)'
});
log4js.configure(__dirname + '/log4js.json');
var logger = log4js.getLogger('bot');

var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var builder = require('botbuilder');
var hashtable = require(__dirname + '/hashtable.js');
var sessions = new hashtable.Hashtable;

// Setup Express Server////////////////////////
app.use(bodyParser.urlencoded({
    limit: '2mb',
    extended: true
}));
app.use(bodyParser.json({ limit: '2mb' }));
app.all('*', function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type');
    next();
});

var config = require('fs').readFileSync(__dirname + '/config.json');
config = JSON.parse(config);

var flows = require('fs').readFileSync(__dirname + '/flow.json');
flows = JSON.parse(flows);

app.get('/api', function (request, response) {
    response.send('API is running');
});

app.get('/logs', function (request, response) {
    var token = request.header('Token');
    if (token == config.bot_app_password) {
        var stream = require('fs').createReadStream('logs/bot.log');
        stream.pipe(response);
    } else {
        response.end('Access Denied');
    }
});

app.get('/download/flow/:flow_id', function (request, response) {
    response.header('Content-Type', 'application/json; charset=utf-8');
    var flow_id = request.params.flow_id;
    var flow;
    for (var index = 0; index < flows.length; index++) {
        if (flows[index].flow_id == flow_id) {
            flow = flows[index];
            break;
        }
    }
    if (flow) {
        var dialogs = {};
        dialogs = require('fs').readFileSync(__dirname + '/flow/' + flow.flow_id + '/dialog.json');
        request.header('Content-Type', 'application/json');
        response.write(dialogs);
        response.end();
    } else {
        response.end('');
    }
});

app.get('/systemvariable', function (request, response) {
    response.header('Content-Type', 'application/json; charset=utf-8');
    var system_variable = require('fs').readFileSync(__dirname + '/system_variable.json');
    system_variable = JSON.parse(system_variable);
    response.write(JSON.stringify(system_variable));
    response.end();
});
app.get('/flows', function (request, response) {
    response.header('Content-Type', 'application/json; charset=utf-8');
    response.write(JSON.stringify(flows));
    response.end();
});
app.post('/flow', function (request, response) {
    request.header('Content-Type', 'application/json');
    var flow = request.body.flow;
    if (flow.active == 'true') {
        global.flow_id = flow.flow_id;
        for (var index = 0; index < flows.length; index++) {
            flows[index].active = 'false';
        }
        LoadFlow(flow);
    }
    flows.push(flow);
    require('fs').writeFile(__dirname + '/flow.json', JSON.stringify(flows), function (err) {
        this.res.write(JSON.stringify({ success: true }));
        this.res.end();
        require('copy-dir')(__dirname + '/flow/template', __dirname + '/flow/' + this.flow_id, function (err) {
            if (err) {
                logger.error(err);
            }
        });
    }.bind({ res: response, flow_id: flow.flow_id }));
});
app.put('/flow/:flow_id', function (request, response) {
    request.header('Content-Type', 'application/json');
    var flow_id = request.params.flow_id;
    var flow = request.body.flow;
    if (flow.active == 'true') {
        global.flow_id = flow.flow_id;
        for (var index = 0; index < flows.length; index++) {
            flows[index].active = 'false';
        }
        LoadFlow(flow);
    }
    for (var index = 0; index < flows.length; index++) {
        if (flows[index].flow_id == flow_id) {
            flows[index] = flow;
            break;
        }
    }
    require('fs').writeFile(__dirname + '/flow.json', JSON.stringify(flows), function (err) {
        this.res.write(JSON.stringify({ success: true }));
        this.res.end();
    }.bind({ res: response }));
});
app.delete('/flow/:flow_id', function (request, response) {
    request.header('Content-Type', 'application/json');
    var flow_id = request.params.flow_id;
    for (var index = 0; index < flows.length; index++) {
        if (flows[index].flow_id == flow_id) {
            flows.splice(index, 1);
            break;
        }
    }
    require('fs').writeFile(__dirname + '/flow.json', JSON.stringify(flows), function (err) {
        this.res.write(JSON.stringify({ success: true }));
        this.res.end();
    }.bind({ res: response }));
});

app.get('/locales/:flow_id', function (request, response) {
    request.header('Content-Type', 'application/json');
    var flow_id = request.params.flow_id;
    var flow;
    for (var index = 0; index < flows.length; index++) {
        if (flows[index].flow_id == flow_id) {
            flow = flows[index];
            break;
        }
    }
    if (flow) {
        var dialogs = {};
        dialogs = require('fs').readFileSync(__dirname + '/flow/' + flow.flow_id + '/dialog.json');
        dialogs = JSON.parse(dialogs);

        var locales = [];
        var files = require('fs').readdirSync(__dirname + '/flow/' + flow.flow_id + '/locale');
        for (var idx = 0; idx < files.length; idx++) {
            var file = files[idx];
            var stat = require('fs').statSync(__dirname + '/flow/' + flow.flow_id + '/locale/' + file)
            if (stat.isDirectory()) {
                locales[file] = JSON.parse(require('fs').readFileSync(__dirname + '/flow/' + flow.flow_id + '/locale/' + file + '/index.json', 'utf8'));
            }
        }

        var _locales = {};
        for (var prop1 in locales) {
            _locales[prop1] = locales[prop1];
            _locales[prop1]._used = [];
            for (var prop2 in locales[prop1]) {
                _locales[prop1][prop2] = locales[prop1][prop2];
                for (idx = 0; idx < dialogs.length; idx++) {
                    if (_locales[prop1]._used.indexOf(prop2) >= 0) {
                        break;
                    }
                    if (dialogs[idx].type == 'text') {
                        if (dialogs[idx].prompt.indexOf('{' + prop2 + '}') > -1) {
                            _locales[prop1]._used.push(prop2);
                            break;
                        }
                    } else if (dialogs[idx].type == 'choice') {
                        if (dialogs[idx].prompt.attachments[0].content.title && dialogs[idx].prompt.attachments[0].content.title.indexOf('{' + prop2 + '}') > -1) {
                            _locales[prop1]._used.push(prop2);
                            break;
                        } else if (dialogs[idx].prompt.attachments[0].content.subtitle && dialogs[idx].prompt.attachments[0].content.subtitle.indexOf('{' + prop2 + '}') > -1) {
                            _locales[prop1]._used.push(prop2);
                            break;
                        } else if (dialogs[idx].prompt.attachments[0].content.text && dialogs[idx].prompt.attachments[0].content.text.indexOf('{' + prop2 + '}') > -1) {
                            _locales[prop1]._used.push(prop2);
                            break;
                        }
                        for (var idy = 0; idy < dialogs[idx].prompt.attachments[0].content.buttons.length; idy++) {
                            if (dialogs[idx].prompt.attachments[0].content.buttons[idy].title.indexOf('{' + prop2 + '}') > -1) {
                                _locales[prop1]._used.push(prop2);
                                break;
                            }
                        }
                    } else if (dialogs[idx].type == 'confirm') {
                        if (dialogs[idx].prompt.attachments[0].content.title && dialogs[idx].prompt.attachments[0].content.title.indexOf('{' + prop2 + '}') > -1) {
                            _locales[prop1]._used.push(prop2);
                            break;
                        } else if (dialogs[idx].prompt.attachments[0].content.subtitle && dialogs[idx].prompt.attachments[0].content.subtitle.indexOf('{' + prop2 + '}') > -1) {
                            _locales[prop1]._used.push(prop2);
                            break;
                        } else if (dialogs[idx].prompt.attachments[0].content.text && dialogs[idx].prompt.attachments[0].content.text.indexOf('{' + prop2 + '}') > -1) {
                            _locales[prop1]._used.push(prop2);
                            break;
                        }
                        for (var idy = 0; idy < dialogs[idx].prompt.attachments[0].content.buttons.length; idy++) {
                            if (dialogs[idx].prompt.attachments[0].content.buttons[idy].title.indexOf('{' + prop2 + '}') > -1) {
                                _locales[prop1]._used.push(prop2);
                                break;
                            }
                        }
                    }
                }
            }
        }
        response.write(JSON.stringify(_locales));
        response.end();
    }
});
app.put('/locale/:locale/:flow_id', function (request, response) {
    request.header('Content-Type', 'application/json');
    var locale = request.params.locale;
    var message = JSON.parse(request.body.message);
    if (message == undefined) message = {};
    locales[locale] = message;
    var flow_id = request.params.flow_id;
    var flow;
    for (var index = 0; index < flows.length; index++) {
        if (flows[index].flow_id == flow_id) {
            flow = flows[index];
            break;
        }
    }
    if (flow) {
        global.locales[flow.flow_id] = locales;
        require('fs').writeFile(__dirname + '/flow/' + flow.flow_id + '/locale/' + locale + '/index.json', JSON.stringify(message), function (err) {
            this.res.write(JSON.stringify({ success: true }));
            this.res.end();
        }.bind({ res: response }));
    }
});

app.get('/dialogs/:flow_id', function (request, response) {
    var flow_id = request.params.flow_id;
    var flow;
    for (var index = 0; index < flows.length; index++) {
        if (flows[index].flow_id == flow_id) {
            flow = flows[index];
            break;
        }
    }
    if (flow) {
        var dialogs = {};
        dialogs = require('fs').readFileSync(__dirname + '/flow/' + flow.flow_id + '/dialog.json');
        dialogs = JSON.parse(dialogs);
        var isNew = 1;

        for (var idx = 0; idx < dialogs.length; idx++) {
            if (dialogs[idx].dialog_uuid == undefined) {
                dialogs[idx].dialog_uuid = dialogs[idx].dialog_id;
                isNew = 0;
            }
        }

        if (isNew == 0) {
            for (var idx = 0; idx < dialogs.length; idx++) {
                for (var idy = 0; idy < dialogs.length; idy++) {
                    if (dialogs[idx].next == dialogs[idy].dialog_uuid) {
                        dialogs[idx].next_id = dialogs[idy].dialog_id;
                        break;
                    }
                }
            }
            require('fs').writeFile(__dirname + '/flow/' + flow.flow_id + '/dialog.json', JSON.stringify(dialogs), function (err) {
            });
        }

        for (var idx = 0; idx < dialogs.length; idx++) {
            dialogs[idx].used = false;
        }
        for (var idx = 0; idx < dialogs.length; idx++) {
            if (dialogs[idx].type == 'choice' || dialogs[idx].type == 'confirm') {
                for (var idy = 0; idy < dialogs[idx].prompt.attachments[0].content.buttons.length; idy++) {
                    var index = dialogs[idx].prompt.attachments[0].content.buttons[idy].dialog_id;
                    // dialogs[index].used = true;
                }
            }
        }
        request.header('Content-Type', 'application/json');
        response.write(JSON.stringify(dialogs));
        response.end();
    }
});
app.post('/dialog/:flow_id', function (request, response) {
    request.header('Content-Type', 'application/json');
    var dialog = request.body.dialog;
    var flow_id = request.params.flow_id;
    var flow;
    for (var index = 0; index < flows.length; index++) {
        if (flows[index].flow_id == flow_id) {
            flow = flows[index];
            break;
        }
    }
    if (flow) {
        var dialogs = {};
        dialogs = require('fs').readFileSync(__dirname + '/flow/' + flow.flow_id + '/dialog.json');
        dialogs = JSON.parse(dialogs);
        dialogs.push(dialog);
        global.dialogs[flow.flow_id] = dialogs;
        if (flow.active == 'true') {
            global.flow_id = flow.flow_id;
        }
        require('fs').writeFile(__dirname + '/flow/' + flow.flow_id + '/dialog.json', JSON.stringify(dialogs), function (err) {
            this.res.write(JSON.stringify({ success: true }));
            this.res.end();
        }.bind({ res: response }));
    }
});
app.put('/dialog/:dialog_id/:flow_id', function (request, response) {
    request.header('Content-Type', 'application/json');
    var dialog = request.body.dialog;
    var flow_id = request.params.flow_id;
    var flow;
    for (var index = 0; index < flows.length; index++) {
        if (flows[index].flow_id == flow_id) {
            flow = flows[index];
            break;
        }
    }
    if (flow) {
        var dialogs = {};
        dialogs = require('fs').readFileSync(__dirname + '/flow/' + flow.flow_id + '/dialog.json');
        dialogs = JSON.parse(dialogs);
        if (request.params.dialog_id == 'editAll') {
            dialogs = dialog;
            dialogs.sort(UP);
        } else {
            dialogs[request.params.dialog_id] = dialog;
        }
        global.dialogs[flow.flow_id] = dialogs;
        if (flow.active == 'true') {
            global.flow_id = flow.flow_id;
        }
        require('fs').writeFile(__dirname + '/flow/' + flow.flow_id + '/dialog.json', JSON.stringify(dialogs), function (err) {
            this.res.write(JSON.stringify({ success: true }));
            this.res.end();
        }.bind({ res: response }));
    }
});
function UP(x, y) {
    return (parseInt(x["dialog_id"]) > parseInt(y["dialog_id"])) ? 1 : -1
}
app.delete('/dialog/:dialog_id/:flow_id', function (request, response) {
    request.header('Content-Type', 'application/json');
    var delete_dialog_id = request.params.dialog_id;
    var flow_id = request.params.flow_id;
    var flow;
    for (var index = 0; index < flows.length; index++) {
        if (flows[index].flow_id == flow_id) {
            flow = flows[index];
            break;
        }
    }
    if (flow) {
        var dialogs = {};
        dialogs = require('fs').readFileSync(__dirname + '/flow/' + flow.flow_id + '/dialog.json');
        dialogs = JSON.parse(dialogs);
        // 將原本連結至刪除目標的 Dialog 指向自己
        for (var idx = 0; idx < dialogs.length; idx++) {
            if (dialogs[idx].type == 'choice' || dialogs[idx].type == 'confirm') {
                for (var idy = 0; idy < dialogs[idx].prompt.attachments[0].content.buttons.length; idy++) {
                    if (dialogs[idx].prompt.attachments[0].content.buttons[idy].dialog_id == dialogs[delete_dialog_id].dialog_uuid) {
                        // 指向自己
                        dialogs[idx].prompt.attachments[0].content.buttons[idy].dialog_id = dialogs[idx].dialog_uuid;
                    }
                }
            } else if (dialogs[idx].type == 'condition') {
                if (dialogs[delete_dialog_id].dialog_uuid == dialogs[idx].condition.success_dialog_id) dialogs[idx].condition.success_dialog_id = dialogs[idx].dialog_uuid;
                else if (dialogs[delete_dialog_id].dialog_uuid == dialogs[idx].condition.fail_dialog_id) dialogs[idx].condition.fail_dialog_id = dialogs[idx].dialog_uuid;
            } else {
                if (dialogs[delete_dialog_id].dialog_uuid == dialogs[idx].next) dialogs[idx].next = dialogs[idx].dialog_uuid;
            }
        }
        dialogs.splice(delete_dialog_id, 1);
        // 將後面的 Dialog 重新編制編號
        for (var idx = delete_dialog_id; idx < dialogs.length; idx++) {
            dialogs[idx].dialog_id = idx;
        }
        for (var idx = 0; idx < dialogs.length; idx++) {
            //將編號改完正確的
            for (var idy = 0; idy < dialogs.length; idy++) {
                if (dialogs[idx].next == dialogs[idy].dialog_uuid) {
                    dialogs[idx].next_id = dialogs[idy].dialog_id;
                    break;
                }
            }
        }
        global.dialogs[flow.flow_id] = dialogs;
        if (flow.active == 'true') {
            global.flow_id = flow.flow_id;
        }
        require('fs').writeFile(__dirname + '/flow/' + flow.flow_id + '/dialog.json', JSON.stringify(dialogs), function (err) {
            this.res.write(JSON.stringify({ success: true }));
            this.res.end();
        }.bind({ res: response }));
    }
});

app.get('/variables/:flow_id', function (request, response) {
    request.header('Content-Type', 'application/json');
    var flow_id = request.params.flow_id;
    var flow;
    for (var index = 0; index < flows.length; index++) {
        if (flows[index].flow_id == flow_id) {
            flow = flows[index];
            break;
        }
    }
    if (flow) {
        var dialogs = {};
        dialogs = require('fs').readFileSync(__dirname + '/flow/' + flow.flow_id + '/dialog.json');
        dialogs = JSON.parse(dialogs);
        var variables = {};
        variables = require('fs').readFileSync(__dirname + '/flow/' + flow.flow_id + '/variable.json');
        variables = JSON.parse(variables);
        for (idx = 0; idx < dialogs.length; idx++) {
            for (var idy = 0; idy < variables.length; idy++) {
                if (dialogs[idx].field == variables[idy].name) {
                    variables[idy].used = true;
                    break;
                }
            }
        }
        response.write(JSON.stringify(variables));
        response.end();
    }
});
app.put('/variables/:flow_id', function (request, response) {
    request.header('Content-Type', 'application/json');
    var variables = request.body.variables;
    var flow_id = request.params.flow_id;
    var flow;
    for (var index = 0; index < flows.length; index++) {
        if (flows[index].flow_id == flow_id) {
            flow = flows[index];
            break;
        }
    }
    if (flow) {
        global.variables[flow.flow_id] = variables;
        require('fs').writeFile(__dirname + '/flow/' + flow.flow_id + '/variable.json', JSON.stringify(variables), function (err) {
            this.res.write(JSON.stringify({ success: true }));
            this.res.end();
        }.bind({ res: response }));
    }
});

app.put('/conversation/:conversation_id/flow/:flow_id/dialog/:dialog_id', function (request, response) {
    var conversation_id = request.params.conversation_id;
    var dialog_id = request.params.dialog_id;
    var flow_id = request.params.flow_id;
    var _Variables = request.body.variables;
    try {
        _Variables = JSON.parse(request.body.variables);
    } catch (e) {
        logger.info('_Variables are not JSON string or undefined');
    }
    if (conversation_id == undefined) {
        response.status(400).send({ error: 'No conversation_id' });
        response.end();
    }
    else if (dialog_id == undefined) {
        response.status(400).send({ error: 'No dialog_id' });
        response.end();
    }
    else if (flow_id == undefined) {
        response.status(400).send({ error: 'No flow_id' });
        response.end();
    }
    else if (preventAddress.has(conversation_id)) {
        var userId, Dialog_length = -1;
        var address = preventAddress.get(conversation_id);
        if (_Variables) {
            for (var K in _Variables) {
                for (var N in global.variables[flow_id]) {
                    if (global.variables[N].name == K[name]) {
                        global.variables[N].content = K[content];
                        break;
                    }
                }
            }
        }
        if (address.channelId == 'webchat') {   // 每一通 WebChat 的 User ID 都一樣，只能用 Conversation ID 區分
            userId = address.conversation.id;
        } else {
            userId = address.user.id;
        }
        try {
            preventDialog.set(userId, JSON.stringify(global.dialogs[flow_id]));
            Dialog_length = global.dialogs[flow_id].length;
        } catch (e) {
            response.status(401).send('No this flow');
            response.end();
        }

        if (Dialog_length != -1 && dialog_id < Dialog_length && dialog_id >= 0) {
            var session = {
                'index': dialog_id,
                'messageTimestamp': new Date(),
            }
            bot.beginDialog(address, "/flow", session);
            response.status(200).send('success');
            response.end();
        }
        else {
            response.status(401).send('No this dialog');
            response.end();
        }
    }
    else {
        response.status(401).send('No this conversation');
        response.end();
    }
});

app.get('/sessions', function (request, response) {
    var _sessions = [];
    for (var idx = 0; idx < sessions.getKeys().length; idx++) {
        var sessionId = sessions.getKeys()[idx];
        var session = sessions.get(sessionId);
        _sessions.push({
            sessionId: sessionId,
            userData: session.userData,
            conversationData: session.conversationData
        });
    }
    request.header('Content-Type', 'application/json');
    response.write(JSON.stringify(_sessions));
    response.end();
});

app.delete('/session/:sessionId', function (request, response) {
    request.header('Content-Type', 'application/json');
    var sessionId = request.params.sessionId;
    var session = sessions.get(sessionId);
    if (session) {
        session.endConversation();
        if (session.message.address.channelId == 'directline') {
            session.send('{ "action": "end_service" }');
        }
        sessions.remove(sessionId);
        response.write(JSON.stringify({ result: true }));
    } else {
        response.write(JSON.stringify({ result: false }));
    }
    response.end();
});

app.get("/getDialog/:flow_id", function (request, response) {
    response.header('Content-Type', 'application/json; charset=utf-8');
    var flow_id = request.params.flow_id;
    var fs = require('fs');
    var dialog = fs.readFileSync(__dirname + '/flow/' + flow_id + '/dialog.json', 'utf8');
    dialog = JSON.parse(dialog);
    var postdata = [];
    for (var i = 0; i < dialog.length; i++) {
        var data = {
            'id': dialog[i].dialog_id,
            'type': '',
            'text': dialog[i].description,
            'goto': '',
            'next': '',
            'color': ''
        }
        switch (dialog[i].type) {
            case 'image':
                data.type = 'inputoutput';
                data.color = 'lightgrey';
                if (dialog[i].next < 0) {
                    data.next = dialog[i].next;
                } else {
                    data.next = dialog[i].next_id;
                }
                postdata.push(data);
                break;
            case 'choice':
                GetProcess(dialog[i].prompt.attachments[0].content.buttons, flow_id, function (processi) {
                    data.type = 'condition';
                    data.goto = processi;
                    data.color = '#09f';
                    postdata.push(data);
                });
                break;
            case 'text':
                data.type = 'operation';
                data.color = 'blanchedalmond';
                if (dialog[i].next < 0) {
                    data.next = dialog[i].next;
                } else {
                    data.next = dialog[i].next_id;
                }
                postdata.push(data);
                break;
            case 'confirm':
                GetProcess(dialog[i].prompt.attachments[0].content.buttons, flow_id, function (processi) {
                    data.type = 'condition';
                    data.goto = processi;
                    data.color = '#0f5';
                    postdata.push(data);
                });
                break;
            case 'card':
                data.type = 'operation';
                data.color = "pink";
                if (dialog[i].next < 0) {
                    data.next = dialog[i].next;
                } else {
                    data.next = dialog[i].next_id;
                }
                postdata.push(data);
                break;
            case 'input':
                data.type = 'inputoutput';
                data.color = "gray";
                if (dialog[i].next < 0) {
                    data.next = dialog[i].next;
                } else {
                    data.next = dialog[i].next_id;
                }
                postdata.push(data);
                break;
            case 'condition':
                var processi = [];
                var success_dialog_id;
                var fail_dialog_id;
                if (dialog[i].condition.success_dialog_id < 0) {
                    success_dialog_id = dialog[i].condition.success_dialog_id;
                } else {
                    for (var j = 0; j < dialog.length; j++) {
                        if (dialog[i].condition.success_dialog_id == dialog[j].dialog_uuid) {
                            success_dialog_id = dialog[j].dialog_id;
                            break;
                        }
                    }
                }
                var process_success_data = {
                    'processname': 'success',
                    'next': success_dialog_id
                }
                processi.push(process_success_data);
                if (dialog[i].condition.fail_dialog_id < 0) {
                    fail_dialog_id = dialog[i].condition.fail_dialog_id;
                } else {
                    for (var j = 0; j < dialog.length; j++) {
                        if (dialog[i].condition.fail_dialog_id == dialog[j].dialog_uuid) {
                            fail_dialog_id = dialog[j].dialog_id;
                            break;
                        }
                    }
                }
                var process_fail_data = {
                    'processname': 'fail',
                    'next': fail_dialog_id
                }
                processi.push(process_fail_data);
                data.type = 'subroutine';
                data.goto = processi;
                data.color = 'orange';
                postdata.push(data);
                break;
            case 'operate':
                data.type = 'subroutine';
                data.color = "mediumpurple";
                if (dialog[i].next < 0) {
                    data.next = dialog[i].next;
                } else {
                    data.next = dialog[i].next_id;
                }
                postdata.push(data);
                break;
            case 'webapi':
                data.type = 'subroutine';
                data.color = "yellow";
                if (dialog[i].next < 0) {
                    data.next = dialog[i].next;
                } else {
                    data.next = dialog[i].next_id;
                }
                postdata.push(data);
                break;
            case 'qna_maker':
                data.type = 'subroutine';
                data.color = '#f40';
                if (dialog[i].next < 0) {
                    data.next = dialog[i].next;
                } else {
                    data.next = dialog[i].next_id;
                }
                postdata.push(data);
                break;
            case 'hanfei':
                data.type = 'subroutine';
                data.color = "blue";
                if (dialog[i].next < 0) {
                    data.next = dialog[i].next;
                } else {
                    data.next = dialog[i].next_id;
                }
                postdata.push(data);
                break;
        }
    }
    response.send(postdata);
});

app.get('/QA/flow', function (request, response) {
    var data = flows.map(function (flow) {
        var rObj = {};
        rObj["id"] = flow.flow_id;
        return rObj;
    });
    logger.info('POST QA flow: ' + JSON.stringify(data));
    response.send(data);
    response.end();
});

function GetProcess(data, flow_id, callback) {
    var process = [];
    var fs = require('fs');
    var dialog = fs.readFileSync(__dirname + '/flow/' + flow_id + '/dialog.json', 'utf8');
    dialog = JSON.parse(dialog);
    for (var i = 0; i < data.length; i++) {
        var dialog_id;
        if (data[i].dialog_id < 0) {
            dialog_id = data[i].dialog_id;
        } else {
            for (var j = 0; j < dialog.length; j++) {
                if (data[i].dialog_id == dialog[j].dialog_uuid) dialog_id = dialog[j].dialog_id;
            }
        }
        var postdata = {
            'processname': data[i].title,
            'next': dialog_id
        }
        process.push(postdata);
    }
    callback(process);
}

app.use(express.static('pages'));
app.get('/pages/flows', function (request, response) {
    logger.info('GET pages/flows request');
    request.header('Content-Type', 'text/html');
    var fs = require('fs');
    fs.readFile(__dirname + '/pages/index.htm', 'utf8', function (err, data) {
        if (err) {
            res.send(err);
        }
        var protocol = 'http://';
        var host = this.req.get('host');
        logger.info('encrypted: ' + this.req.connection.encrypted);
        if (this.req.connection.encrypted) {
            protocol = 'https://';
        }
        data = data +
        '<script type="text/javascript"> var ServiceUrl = "' + protocol + host + '"; </script>';
        this.res.send(data);
    }.bind({ req: request, res: response }));
});
app.get('/pages/flow/:flow_id', function (request, response) {
    logger.info('GET pages/flow request');
    var flow_id = request.params.flow_id;
    request.header('Content-Type', 'text/html');
    var flow;
    for (var index = 0; index < flows.length; index++) {
        if (flows[index].flow_id == flow_id) {
            flow = flows[index];
            break;
        }
    }
    var flow_all_id = [];
    for (var index = 0; index < flows.length; index++) {
        if (flows[index].flow_id != flow.flow_id) {
            var rObj = {};
            rObj["id"] = flows[index].flow_id;
            flow_all_id.push(rObj);
        }
    }
    if (flow) {
        var fs = require('fs');
        fs.readFile(__dirname + '/pages/dialog.htm', 'utf8', function (err, data) {
            if (err) {
                res.send(err);
            }
            var protocol = 'http://';
            var host = this.req.get('host');
            logger.info('encrypted: ' + this.req.connection.encrypted);
            if (this.req.connection.encrypted) {
                protocol = 'https://';
            }
            data = data +
            '<script type="text/javascript"> var ServiceUrl = "' + protocol + host + '"; </script>';
            data = data +
            '<script type="text/javascript"> var FlowID = "' + this.flow.flow_id + '"; </script>';
            data = data +
            '<script type="text/javascript"> var FlowDescription = "' + this.flow.flow_id + '"; </script>';
            data = data +
            '<script type="text/javascript"> var FlowAllId = ' + JSON.stringify(flow_all_id) + '; </script>';
            this.res.send(data);
        }.bind({ req: request, res: response, flow: flow }));
    }
});
app.get('/pages/flowchart/:flow_id', function (request, response) {
    logger.info('GET pages/flowchart request');
    request.header('Content-Type', 'text/html');
    var fs = require('fs');
    fs.readFile(__dirname + '/pages/flowchart.htm', 'utf8', function (err, data) {
        if (err) {
            res.send(err);
        }
        this.res.send(data);
    }.bind({ req: request, res: response }));
});
app.get('/pages/sessions', function (request, response) {
    logger.info('GET pages/sessions request');
    request.header('Content-Type', 'text/html');
    var fs = require('fs');
    fs.readFile(__dirname + '/pages/session.htm', 'utf8', function (err, data) {
        if (err) {
            res.send(err);
        }
        var protocol = 'http://';
        var host = this.req.get('host');
        logger.info('encrypted: ' + this.req.connection.encrypted);
        if (this.req.connection.encrypted) {
            protocol = 'https://';
        }
        data = data +
        '<script type="text/javascript"> var ServiceUrl = "' + protocol + host + '"; </script>';
        this.res.send(data);
    }.bind({ req: request, res: response }));
});
app.get("/pages/flow/flowchart/:flow_id", function (request, response) {
    logger.info('GET pages/flow/flowchart request');
    var flow_id = request.params.flow_id;
    request.header('Content-Type', 'text/html');
    var flow;
    for (var index = 0; index < flows.length; index++) {
        if (flows[index].flow_id == flow_id) {
            flow = flows[index];
            break;
        }
    }
    if (flow) {
        var fs = require('fs');
        fs.readFile(__dirname + '/pages/jointjs.htm', 'utf8', function (err, data) {
            if (err) {
                this.res.send(err);
            }
            var protocol = 'http://';
            var host = this.req.get('host');
            logger.info('encrypted: ' + this.req.connection.encrypted);
            if (this.req.connection.encrypted) {
                protocol = 'https://';
            }
            data = data +
            '<script type="text/javascript"> var ServiceUrl = "' + protocol + host + '"; </script>';
            data = data +
            '<script type="text/javascript"> var FlowID = "' + this.flow.flow_id + '"; </script>';
            data = data +
            '<script type="text/javascript"> var FlowDescription = "' + this.flow.flow_id + '"; </script>';
            this.res.send(data);
        }.bind({ req: request, res: response, flow: flow }));
    }
});
app.get('/pages/login', function (request, response) {
    var conversation_id = request.query.conversation_id;
    var dialog_id = request.query.dialog_id;
    logger.info('GET /pages/profile request');
    request.header('Content-Type', 'text/html');
    var fs = require('fs');
    fs.readFile(__dirname + '/pages/login.htm', 'utf8', function (err, data) {
        if (err) {
            res.send(err);
        }
        var protocol = 'http://';
        var host = this.req.get('host');
        logger.info('encrypted: ' + this.req.connection.encrypted);
        if (this.req.connection.encrypted) {
            protocol = 'https://';
        }
        data = data +
        '<script type="text/javascript"> var conversation_id = "' + conversation_id + '"; var dialog_id = "' + dialog_id + '" </script>';
        this.res.send(data);
    }.bind({ req: request, res: response }));
});

// =========================================================
// Bot Setup
// =========================================================

global.dialogs = [], global.variables = [], global.locales = [], global.flow_id = -1;
for (var index = 0; index < flows.length; index++) {
    if (flows[index].active == 'true') {
        global.flow_id = flows[index].flow_id;
        LoadFlow(flows[index]);
        break;
    }
}

function LoadFlow(flow) {
    if (global.dialogs == "") {
        var files = require('fs').readdirSync(__dirname + '/flow');//读取该文件夹
        files.forEach(function (file) {
            var stats = require('fs').statSync(__dirname + '/flow/' + file);
            if (stats.isDirectory()) {
                require('fs').readFile(__dirname + '/flow/' + file + '/dialog.json', 'utf8', function (err, text) {
                    try {
                        global.dialogs[file] = {};
                        global.dialogs[file] = text;
                        global.dialogs[file] = JSON.parse(global.dialogs[file]);
                    } catch (e) { return logger.error(e); }
                });
            }
        });
    }
    if (global.variables == "") {
        var files = require('fs').readdirSync(__dirname + '/flow');//读取该文件夹
        files.forEach(function (file) {
            var stats = require('fs').statSync(__dirname + '/flow/' + file);
            if (stats.isDirectory()) {
                require('fs').readFile(__dirname + '/flow/' + file + '/variable.json', 'utf8', function (err, text) {
                    try {
                        global.variables[file] = {};
                        global.variables[file] = text;
                        global.variables[file] = JSON.parse(global.variables[file]);
                    } catch (e) { return logger.error(e); }
                });
            }
        });
    }
    if (global.locales == "") {
        var files = require('fs').readdirSync(__dirname + '/flow');//读取该文件夹
        files.forEach(function (file) {
            var stats = require('fs').statSync(__dirname + '/flow/' + file);
            if (stats.isDirectory()) {
                require('fs').readdir(__dirname + '/flow/' + file + '/locale', function (err, locales) {
                    if (err) {
                        return logger.error(err);
                    }
                    locales.forEach(function (locale, index) {
                        require('fs').stat(__dirname + '/flow/' + this.flow_id + '/locale/' + locale, function (error, stat) {
                            if (error) {
                                return logger.error(error);
                            }
                            if (stat.isDirectory()) {
                                require('fs').readFile(__dirname + '/flow/' + this.flow_id + '/locale/' + locale + '/index.json', 'utf8', function (err, text) {
                                    try {
                                        global.locales[this.flow_id] = [];
                                        global.locales[this.flow_id][this.locale] = {};
                                        global.locales[this.flow_id][this.locale] = text;
                                        global.locales[this.flow_id][this.locale] = JSON.parse(global.locales[this.flow_id][this.locale]);
                                    } catch (e) { return logger.error(e); }
                                }.bind({ locale: locale, flow_id: this.flow_id }));
                            }
                        }.bind({ flow_id: this.flow_id }));
                    }.bind({ flow_id: this.flow_id }));
                }.bind({ flow_id: file }));
            }
        });
    }
    global.dialogs[flow.flow_id] = {};
    global.dialogs[flow.flow_id] = require('fs').readFileSync(__dirname + '/flow/' + flow.flow_id + '/dialog.json');
    global.dialogs[flow.flow_id] = JSON.parse(global.dialogs[flow.flow_id]);

    global.variables[flow.flow_id] = {};
    global.variables[flow.flow_id] = require('fs').readFileSync(__dirname + '/flow/' + flow.flow_id + '/variable.json');
    global.variables[flow.flow_id] = JSON.parse(global.variables[flow.flow_id]);

    global.locales[flow.flow_id] = [];
    require('fs').readdir(__dirname + '/flow/' + flow.flow_id + '/locale', function (err, files) {
        if (err) {
            return logger.error(err);
        }
        files.forEach(function (file, index) {
            require('fs').stat(__dirname + '/flow/' + this.flow_id + '/locale/' + file, function (error, stat) {
                if (error) {
                    return logger.error(error);
                }
                if (stat.isDirectory()) {
                    require('fs').readFile(__dirname + '/flow/' + this.flow_id + '/locale/' + file + '/index.json', 'utf8', function (err, text) {
                        try {
                            global.locales[this.flow_id][this.file] = JSON.parse(text);
                        } catch (e) { return logger.error(err); }
                    }.bind({ file: file, flow_id: this.flow_id }));
                }
            }.bind({ flow_id: this.flow_id }));
        }.bind({ flow_id: this.flow_id }));
    }.bind({ flow_id: flow.flow_id }));
}

// Create chat bot
var connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId || config.bot_app_id,
    appPassword: process.env.MicrosoftAppPassword || config.bot_app_password
});

var inMemoryStorage = new builder.MemoryBotStorage();

var bot = new builder.UniversalBot(connector).set('storage', inMemoryStorage);
app.post('/api/messages', connector.listen());

app.get('/api/reset', function (req, res) {
    logger.info('sessions.length: ' + sessions.getKeys().length);
    for (var idx = 0; idx < sessions.getKeys().length; idx++) {
        var session = sessions.get(sessions.getKeys()[idx]);
        logger.info('Send end dialog to session');
        // session.send('很抱歉，系統發生無法預期的錯誤，請您重新發送新的訊息，謝謝');
        session.userData.status = undefined;
        session.userData._updateTime = undefined;
        // session.beginDialog('/end');
        /**
        if (session.conversationData) {
            session.endDialogWithResult({ response: session.conversationData.form });
        } else {
            session.endDialogWithResult({});
        }
        */
        session.endConversation();
        if (session.message.address.channelId == 'directline') {
            session.send('{ "action": "end_service" }');
        }
        sessions.remove(sessions.getKeys()[idx]);
    }
    res.write('Reset Success');
    res.end();
});

//=========================================================
// Snapin Restful
//=========================================================

var queues = new hashtable.Hashtable;
var token_snapin = new hashtable.Hashtable;
var snapin_queue = new hashtable.Hashtable;
var snapin_timestamp = new hashtable.Hashtable;

app.post('/api/register', function (req, res) {
    var ipaddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    var snapin_name = req.body.snapin_name;
    var timestamp = req.body.timestamp;
    var channelId = req.body.channelId;
    logger.info('[' + timestamp + '] 發現 Snapin [' + snapin_name + '][' + channelId + '] 從位址 ' + ipaddress + ' 登入');
    if (channelId != undefined && timestamp != undefined) {
        var token;
        var queue = new Array();
        if (channelId == 'directline') {
            token = hash(snapin_name + timestamp);
            if (snapin_timestamp.containsKey(snapin_name)) {
                if (snapin_timestamp.get(snapin_name) == undefined || snapin_timestamp.get(snapin_name) < timestamp) {
                    logger.info('用新連線取代舊連線');
                    try { snapin_timestamp.remove(snapin_name); } catch (e) { }
                    snapin_timestamp.add(snapin_name, timestamp);
                    try { snapin_queue.remove(snapin_name); } catch (e) { }
                    snapin_queue.add(snapin_name, queue);
                    try { token_snapin.remove(snapin_name); } catch (e) { }
                    token_snapin.add(token, snapin_name);
                }
            } else {
                snapin_timestamp.add(snapin_name, timestamp);
                snapin_queue.add(snapin_name, queue);
                token_snapin.add(token, snapin_name);
            }
        } else {
            token = hash(channelId + timestamp);
            if (snapin_timestamp.containsKey(channelId)) {
                if (snapin_timestamp.get(channelId) == undefined || snapin_timestamp.get(snapin_name) < timestamp) {
                    logger.info('用新連線取代舊連線');
                    try { snapin_timestamp.remove(channelId); } catch (e) { }
                    snapin_timestamp.add(channelId, timestamp);
                    try { snapin_queue.remove(channelId); } catch (e) { }
                    snapin_queue.add(channelId, queue);
                    try { token_snapin.remove(channelId); } catch (e) { }
                    token_snapin.add(token, channelId);
                }
            } else {
                snapin_timestamp.add(channelId, timestamp);
                snapin_queue.add(channelId, queue);
                token_snapin.add(token, channelId);
            }
        }
        if (!queues.containsKey(token)) {
            queues.add(token, queue);
        }
        res.end(JSON.stringify({ result: true, ret: token }));
    } else {
        res.end(JSON.stringify({ result: false }));
    }
});

app.get('/api/messages/:token', function (req, res) {
    var ipaddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    var token = req.params.token;
    var queue = queues.get(token);
    var snapin_name = token_snapin.get(token);
    if (!queue) {
        res.end(JSON.stringify({ result: false, error: 'token illegal' }));
        return;
    }
    logger.info('發現 Snapin [' + snapin_name + '] 從位址 ' + ipaddress + ' 取得訊息');
    var messages = [];
    var length = queue.length;
    if (length > 5) {
        for (var idx = 0; idx < 5; idx++) {
            messages.push(queue.shift());
        }
    } else {
        for (var idx = 0; idx < length; idx++) {
            messages.push(queue.shift());
        }
    }
    res.end(JSON.stringify({ result: true, ret: messages }));
});

function hash(message) {
    const crypto = require('crypto');
    const secret = '12345678';
    const hash = crypto.createHmac('sha256', secret)
        .update(message)
        .digest('hex');
    return hash;
}

app.put('/api/error/:action/:acct/:token', function (req, res) {
    var acct = req.params.acct;
    var token = req.params.token;
    logger.info('從 Snapin [' + token + '] 接收到 error 指令，使用者是 ' + acct);
    var session = sessions.get(acct);
    logger.info('Found lose session - ' + session.userData.userId);
    logger.info('Send end dialog to session');
    // session.send('很抱歉，系統發生無法預期的錯誤，請您重新發送新的訊息，謝謝');
    session.userData.status = undefined;
    session.userData._updateTime = undefined;
    session.beginDialog('/end');
    res.end(JSON.stringify({ result: true }));
});
app.put('/api/registered/:acct/:token', function (req, res) {
    var acct = req.params.acct;
    var token = req.params.token;
    logger.info('從 Snapin [' + token + '] 接收到 registered 指令，使用者是 ' + acct);
    var session = sessions.get(acct);
    if (session != undefined) {
        if (session.userData.status != undefined) {
            session.userData.status = 'start_service';
            var queue = snapin_queue.get(session.userData.snapin_name);
            if (queue != undefined) {
                var Messages = preventMessage.get(session.userData.userId);
                if (sessions.get(acct).conversationData.form == undefined) {
                    sessions.get(acct).conversationData.form = {};
                }
                sessions.get(acct).conversationData.form['Messages'] = Messages;
                var message = {
                    type: 'start_service',
                    acct: session.userData.userId,
                    user_data: sessions.get(acct).conversationData.form
                };
                queue.push(message);
            }
            res.end(JSON.stringify({ result: true }));
        } else {
            res.end(JSON.stringify({ result: false }));
        }
    } else {
        res.end(JSON.stringify({ result: false }));
    }
});
app.put('/api/ringing/:acct/:token', function (req, res) {
    var acct = req.params.acct;
    var token = req.params.token;
    logger.info('從 Snapin [' + token + '] 接收到 ringing 指令，使用者是 ' + acct);
    var session = sessions.get(acct);
    if (session != undefined) {
        if (session.userData.status != undefined) {
            session.userData.status = 'ringing';
            res.end(JSON.stringify({ result: true }));
        } else {
            res.end(JSON.stringify({ result: false }));
        }
    } else {
        res.end(JSON.stringify({ result: false }));
    }
});
app.put('/api/answered/:acct/:token', function (req, res) {
    var acct = req.params.acct;
    var token = req.params.token;
    logger.info('從 Snapin [' + token + '] 接收到 answered 指令，使用者是 ' + acct);
    var session = sessions.get(acct);
    if (session != undefined) {
        if (session.userData.status != undefined) {
            session.userData.status = 'answered';
            res.end(JSON.stringify({ result: true }));
        } else {
            res.end(JSON.stringify({ result: false }));
        }
    } else {
        res.end(JSON.stringify({ result: false }));
    }
});
app.put('/api/message/:acct/:token', function (req, res) {
    var acct = req.params.acct;
    var msg = req.body.msg;
    msg = decodeURI(msg);
    var token = req.params.token;
    logger.info('從 Snapin [' + token + '] 接收到 message 指令，使用者是 ' + acct);
    var session = sessions.get(acct);
    var userConversationMessage = preventMessage.get(session.userData.userId);
    if (session != undefined) {
        if (session.userData.status != undefined) {
            session.send(msg);
            userConversationMessage.push({ type: 'message', acct: 'agent', message: msg });
            preventMessage.set(session.userData.userId, userConversationMessage);
            session.userData._updateTime = new Date();
            res.end(JSON.stringify({ result: true }));
        } else {
            res.end(JSON.stringify({ result: false }));
        }
    } else {
        res.end(JSON.stringify({ result: false }));
    }
});
app.put('/api/locate/:acct/:token', function (req, res) {
    var acct = req.params.acct;
    var token = req.params.token;
    logger.info('從 Snapin [' + token + '] 接收到 locate 指令，使用者是 ' + acct);
    var session = sessions.get(acct);
    if (session != undefined) {
        if (session.userData.status != undefined) {
            session.userData._updateTime = new Date();
            res.end(JSON.stringify({ result: true }));
        } else {
            res.end(JSON.stringify({ result: false }));
        }
    } else {
        res.end(JSON.stringify({ result: false }));
    }
});
app.put('/api/location/:acct/:token', function (req, res) {
    var acct = req.params.acct;
    var token = req.params.token;
    var latitude = req.body.latitude;
    var longitude = req.body.longitude;
    var accuracy = req.body.accuracy;
    logger.info('從 Snapin [' + token + '] 接收到 location 指令，使用者是 ' + acct);
    var session = sessions.get(acct);
    if (session != undefined) {
        if (session.userData.status != undefined) {
            session.userData._updateTime = new Date();
            res.end(JSON.stringify({ result: true }));
        } else {
            res.end(JSON.stringify({ result: false }));
        }
    } else {
        res.end(JSON.stringify({ result: false }));
    }
});
app.put('/api/resource/:acct/:token', function (req, res) {
    var acct = req.params.acct;
    var token = req.params.token;
    var resource = req.body.resource;
    logger.info('從 Snapin [' + token + '] 接收到 resource 指令，使用者是 ' + acct);

    var session = sessions.get(acct);
    var userConversationMessage = preventMessage.get(session.userData.userId);
    if (session != undefined) {
        if (session.userData.status != undefined) {
            logger.info('resource.Type ' + resource.Type);
            var msg;
            if (resource.Type == 'Image' || resource.Type == 'Picture') {
                logger.info('resource.Content ' + resource.Content);
                msg = {
                    text: '',
                    attachments: [
                        {
                            contentType: 'image/jpeg',
                            contentUrl: resource.Content
                        }
                    ]
                }
                /**
                msg = new builder.Message(session)
                    .attachments([{
                        contentType: 'image/jpeg',
                        contentUrl: resource.Content
                    }]);
                */
            }
            if (resource.Type == 'Audio') {
                logger.info('resource.Content ' + resource.Content);
                msg = new builder.Message(session)
                    .attachments([{
                    contentType: 'audio/wav',
                    contentUrl: resource.Content
                }]);
            }
            if (resource.Type == 'URL') {
                logger.info('resource.Content ' + resource.Content);
                msg = decodeURI(resource.Title) + ' (' + resource.Content + ')';
            }
            if (msg != undefined) {
                session.send(msg);
                userConversationMessage.push({ type: 'message', acct: 'agent', message: msg });
                preventMessage.set(session.userData.userId, userConversationMessage);
            }
            session.userData._updateTime = new Date();
            res.end(JSON.stringify({ result: true }));
        } else {
            res.end(JSON.stringify({ result: false }));
        }
    } else {
        res.end(JSON.stringify({ result: false }));
    }
});
app.put('/api/conferenced/:acct/:token', function (req, res) {
    var acct = req.params.acct;
    var token = req.params.token;
    logger.info('從 Snapin [' + token + '] 接收到 conferenced 指令，使用者是 ' + acct);
    var session = sessions.get(acct);
    if (session != undefined) {
        if (session.userData.status != undefined) {
            session.userData._updateTime = new Date();
            res.end(JSON.stringify({ result: true }));
        } else {
            res.end(JSON.stringify({ result: false }));
        }
    } else {
        res.end(JSON.stringify({ result: false }));
    }
});
app.put('/api/end_service/:acct/:token', function (req, res) {
    var acct = req.params.acct;
    var token = req.params.token;
    logger.info('從 Snapin [' + token + '] 接收到 end_service 指令，使用者是 ' + acct);
    var session = sessions.get(acct);
    if (session != undefined) {
        if (session.userData.status != undefined) {
            session.userData.status = undefined;
            session.userData._updateTime = undefined;
            session.beginDialog('/end');
            res.end(JSON.stringify({ result: true }));
        } else {
            res.end(JSON.stringify({ result: false }));
        }
    } else {
        res.end(JSON.stringify({ result: false }));
    }
});
app.put('/api/holded/:acct/:token', function (req, res) {
    var acct = req.params.acct;
    var token = req.params.token;
    logger.info('從 Snapin [' + token + '] 接收到 holded 指令，使用者是 ' + acct);
    var session = sessions.get(acct);
    if (session != undefined) {
        if (session.userData.status != undefined) {
            session.userData._updateTime = new Date();
            res.end(JSON.stringify({ result: true }));
        } else {
            res.end(JSON.stringify({ result: false }));
        }
    } else {
        res.end(JSON.stringify({ result: false }));
    }
});
app.put('/api/retrieved/:acct/:token', function (req, res) {
    var acct = req.params.acct;
    var token = req.params.token;
    logger.info('從 Snapin [' + token + '] 接收到 retrieved 指令，使用者是 ' + acct);
    var session = sessions.get(acct);
    if (session != undefined) {
        if (session.userData.status != undefined) {
            session.userData._updateTime = new Date();
            res.end(JSON.stringify({ result: true }));
        } else {
            res.end(JSON.stringify({ result: false }));
        }
    } else {
        res.end(JSON.stringify({ result: false }));
    }
});

//=========================================================
// Snapin WebSocket
//=========================================================

var http;
var server_options = {};
var server;
try {
    if (config.ssl.enable) {
        http = require('https');
        if (config.ssl.type == 'crt') {
            server_options.key = require('fs').readFileSync(config.ssl.key);
            server_options.cert = require('fs').readFileSync(config.ssl.cert);
            server_options.ca = require('fs').readFileSync(config.ssl.ca);
        } else if (config.ssl.type = 'pfx') {
            server_options.pfx = require('fs').readFileSync(config.ssl.pfx);
            server_options.passphrase = require('fs').readFileSync(config.ssl.passphrase);
        }
        server = http.createServer(server_options, app);	// create express server
    } else {
        http = require('http');
        server = http.createServer(app);	// create express server
    }
} catch (e) {
    logger.error(e);
    http = require('http');
    server = http.createServer(app);	// create express server
}
var options = {
    pingTimeout: 60000,
    pingInterval: 3000
};
var io = require('socket.io')(server, options);
var snapins = new hashtable.Hashtable;

io.sockets.on('connection', function (client) {
    logger.info('偵測到 Snapin 連線');
    client.ipaddress = client.handshake.headers['x-forwarded-for'] || client.handshake.address;

    client.timestamp = client.handshake.query.timestamp;
    // register
    client.on('register', function (type, snapin_name, channelId) {
        client.emit('ack', 'register');
        if (type == 'snapin') {
            logger.info('[' + client.timestamp + '] 發現 Snapin [' + snapin_name + '][' + channelId + '] 從位址 ' + client.ipaddress + ' 登入');
            client.snapin_name = snapin_name;
            client.channelId = channelId;
            if (channelId != undefined) {
                if (channelId == 'directline') {
                    if (snapins.containsKey(snapin_name)) {
                        if (snapins.get(snapin_name).timestamp == undefined || snapins.get(snapin_name).timestamp < client.timestamp) {
                            logger.info('用新連線取代舊連線');
                            var snapin = snapins.get(snapin_name);
                            try { snapin.disconnect(); } catch (e) { }
                            try { snapins.remove(snapin_name); } catch (e) { }
                            snapins.add(snapin_name, client);
                        }
                    } else {
                        snapins.add(snapin_name, client);
                    }
                } else {
                    if (snapins.containsKey(channelId)) {
                        if (snapins.get(channelId).timestamp == undefined || snapins.get(channelId).timestamp < client.timestamp) {
                            logger.info('用新連線取代舊連線');
                            var snapin = snapins.get(channelId);
                            try { snapin.disconnect(); } catch (e) { }
                            try { snapins.remove(channelId); } catch (e) { }
                            snapins.add(channelId, client);
                        }
                    } else {
                        snapins.add(channelId, client);
                    }
                }
                RegisterSnapinEvent(client);
            } else {
                client.emit('not_ok', 'register');
            }
        }
    });
});

function RegisterSnapinEvent(client) {
    client.on('ok', function (action, acct, params) {
        logger.info('從 Snapin [' + client.snapin_name + '][' + client.channelId + '] 接收到 ' + action + ' 的 ok 指令，使用者是 ' + acct);
        if (action == 'register') {
            sessions.get(acct).userData.status = 'start_service';
            var snapin = snapins.get(sessions.get(acct).userData.snapin_name);
            if (snapin != undefined) {
                // sessions.get(acct).userData.Agent = 'i-robot';  // 指定機器人
                logger.info('Dialog data: ' + JSON.stringify(sessions.get(acct).conversationData));
                logger.info('Dialog form data: ' + JSON.stringify(sessions.get(acct).conversationData.form));
                var Messages = preventMessage.get(session.userData.userId);
                if (sessions.get(acct).conversationData.form == undefined) {
                    sessions.get(acct).conversationData.form = {};
                }
                sessions.get(acct).conversationData.form['Messages'] = Messages;
                snapin.emit('start_service', acct, sessions.get(acct).conversationData.form, null);
            }
        }
    });
    client.on('not_ok', function (action, acct) {
        logger.info('從 Snapin [' + client.snapin_name + '][' + client.channelId + '] 接收到 ' + action + ' 的 not_ok 指令，使用者是 ' + acct);
        var session = sessions.get(acct);
        logger.info('Found lose session - ' + session.userData.userId);
        logger.info('Send end dialog to session');
        // session.send('很抱歉，系統發生無法預期的錯誤，請您重新發送新的訊息，謝謝');
        session.userData.status = undefined;
        session.userData._updateTime = undefined;
        session.beginDialog('/end');
    });
    client.on('ringing', function (acct, workitem) {
        logger.info('從 Snapin [' + client.snapin_name + '][' + client.channelId + '] 接收到 ringing 指令，使用者是 ' + acct);
        var session = sessions.get(acct);
        if (session != undefined) {
            session.userData.status = 'ringing';
        }
    });
    client.on('answered', function (acct) {
        logger.info('從 Snapin [' + client.snapin_name + '][' + client.channelId + '] 接收到 answered 指令，使用者是 ' + acct);
        var session = sessions.get(acct);
        if (session != undefined) {
            session.userData.status = 'answered';
        }
    });
    client.on('message', function (acct, agent, msg) {
        logger.info('從 Snapin [' + client.snapin_name + '][' + client.channelId + '] 接收到 message 指令，使用者是 ' + acct);
        var session = sessions.get(acct);
        if (session != undefined) {
            session.send(msg);
            var userConversationMessage = preventMessage.get(session.userData.userId);
            userConversationMessage.push({ type: 'message', acct: 'agent', message: msg });
            preventMessage.set(session.userData.userId, userConversationMessage);
        }
    });
    client.on('locate', function (acct, agent) {
        logger.info('從 Snapin [' + client.snapin_name + '][' + client.channelId + '] 接收到 locate 指令，使用者是 ' + acct);
        var session = sessions.get(acct);
        if (session != undefined) {
        }
        // clients.get(acct).emit('locate', agent, workitem_id);
    });
    client.on('location', function (acct, agent, latitude, longitude, accuracy) {
        logger.info('從 Snapin [' + client.snapin_name + '][' + client.channelId + '] 接收到 location 指令，使用者是 ' + acct);
        var session = sessions.get(acct);
        if (session != undefined) {
        }
        // clients.get(acct).emit('location', latitude, longitude, accuracy, workitem_id);
    });
    client.on('resource', function (acct, agent, _resource) {
        logger.info('從 Snapin [' + client.snapin_name + '][' + client.channelId + '] 接收到 resource 指令，使用者是 ' + acct);
        var session = sessions.get(acct);
        if (session != undefined) {
            logger.info('resource.Type ' + _resource.Type);
            var msg;
            if (_resource.Type == 'Image' || _resource.Type == 'Picture') {
                logger.info('resource.Content ' + _resource.Content);
                msg = new builder.Message(session)
                    .attachments([{
                    contentType: 'image/jpeg',
                    contentUrl: _resource.Content
                }]);
            }
            if (_resource.Type == 'Audio') {
                logger.info('resource.Content ' + _resource.Content);
                msg = new builder.Message(session)
                    .attachments([{
                    contentType: 'audio/wav',
                    contentUrl: _resource.Content
                }]);
            }
            if (_resource.Type == 'URL') {
                logger.info('resource.Content ' + _resource.Content);
                msg = _resource.Title + ' (' + _resource.Content + ')';
            }
            if (msg != undefined) {
                session.send(msg);
                var userConversationMessage = preventMessage.get(session.userData.userId);
                userConversationMessage.push({ type: 'resource', acct: 'agent', message: msg });
                preventMessage.set(session.userData.userId, userConversationMessage);
            }
        }
        // clients.get(acct).emit('resource', _resource, workitem_id);
    });
    client.on('conferenced', function (acct) {
        logger.info('從 Snapin [' + client.snapin_name + '][' + client.channelId + '] 接收到 conferenced 指令，使用者是 ' + acct);
        var session = sessions.get(acct);
        if (session != undefined) {
        }
        // clients.get(acct).emit('answered', workitem_id);
    });
    client.on('end_service', function (acct) {
        logger.info('從 Snapin [' + client.snapin_name + '][' + client.channelId + '] 接收到 end_service 指令，使用者是 ' + acct);
        var session = sessions.get(acct);
        if (session != undefined) {
            session.userData.status = undefined;
            session.userData._updateTime = undefined;
            session.beginDialog('/end');
        }
    });
    client.on('holded', function (acct) {
        logger.info('從 Snapin [' + client.snapin_name + '][' + client.channelId + '] 接收到 holded 指令，使用者是 ' + acct);
        var session = sessions.get(acct);
        if (session != undefined) {
            session.send('資料查詢中，請稍後片刻');
            var userConversationMessage = preventMessage.get(session.userData.userId);
            userConversationMessage.push({ type: 'message', acct: 'agent', message: '資料查詢中，請稍後片刻' });
            preventMessage.set(session.userData.userId, userConversationMessage);
        }
    });
    client.on('retrieved', function (acct) {
        logger.info('從 Snapin [' + client.snapin_name + '][' + client.channelId + '] 接收到 retrieved 指令，使用者是 ' + acct);
        var session = sessions.get(acct);
        if (session != undefined) {
        }
    });
    client.on('disconnect', function (acct) {
        logger.info('從 Snapin [' + client.snapin_name + '][' + client.channelId + '] 接收到 disconnect 指令');
        if (client.channelId == 'directline') {
            try { snapins.remove(client.snapin_name); } catch (e) { }
        } else {
            try { snapins.remove(client.channelId); } catch (e) { }
        }
        var session = sessions.get(acct);
        if (session != undefined) {
        }
    });
    client.on('pong', function (acct) {
        logger.debug('從 Snapin [' + client.snapin_name + '][' + client.channelId + '] 接收到 PONG 指令');
        var snapin;
        if (client.channelId == 'directline') {
            snapin = snapins.get(client.snapin_name);
        } else {
            snapin = snapins.get(client.channelId);
        }
        if (snapin != undefined) {
            snapin.ping_timestamp = new Date();
        }
        var session = sessions.get(acct);
        if (session != undefined) {
        }
    });
    client.on('pingAck', function (acct) {
        logger.debug('從 Snapin [' + client.snapin_name + '][' + client.channelId + '] 接收到 PINGACK 指令');
        var snapin;
        if (client.channelId == 'directline') {
            snapin = snapins.get(client.snapin_name);
        } else {
            snapin = snapins.get(client.channelId);
        }
        if (snapin != undefined) {
            snapin.ping_timestamp = new Date();
        }
        var session = sessions.get(acct);
        if (session != undefined) {
        }
    });
}

//=========================================================
// Bots Dialogs
//=========================================================
var preventDialog = new Map();
var preventMessage = new Map();
var preventAddress = new Map();

bot.on('conversationUpdate', function (message) {
    if (message.membersAdded && message.membersAdded.length > 0) {
        if (config.channel_flow[message.address.channelId] != undefined && config.channel_flow[message.address.channelId] != "") {
            global.flow_id = config.channel_flow[message.address.channelId];
        }
    }
});

bot.dialog('/',
    function (session) {
        /*  這邊是用來查看session裡預設是什麼
        seen = [];
 
        var replacer = function (key, value) {
            if (value != null && typeof value == "object") {
                if (seen.indexOf(value) >= 0) {
                    return;
                }
                seen.push(value);
            }
            return value;
        };
        logger.info('session:' + JSON.stringify(session, replacer)); 
        session.userData.dialogs = JSON.parse(JSON.stringify(global.dialogs)); 
        */
        if (config.channel_flow[session.message.address.channelId] != undefined && config.channel_flow[session.message.address.channelId] != "") {
            global.flow_id = config.channel_flow[session.message.address.channelId];
        }
        session.userData = {};  // 若要保留上次的內容，可註解掉這一行
        session.userData.locale = 'tw';
        session.userData.status = undefined;
        session.userData._updateTime = undefined;
        session.userData.flow_id = [];
        session.userData.flow_id.push(global.flow_id);
        session.userData.channelId = session.message.address.channelId;
        if (session.message.address.channelId == 'directline') {
            session.userData.snapin_name = session.message.user.snapin_name;
        } else {
            session.userData.snapin_name = session.message.address.channelId;
        }
        logger.info('=========================================================');
        logger.info('localizer: ' + JSON.stringify(session.localizer));
        logger.info('sessionState: ' + JSON.stringify(session.sessionState));
        logger.info('conversationData: ' + JSON.stringify(session.conversationData));
        logger.info('message: ' + JSON.stringify(session.message));
        logger.info('userData: ' + JSON.stringify(session.userData));
        logger.info('privateConversationData: ' + JSON.stringify(session.privateConversationData));
        logger.info('user: ' + JSON.stringify(session.message.user));
        logger.info('=========================================================');
        if (session.message.address.channelId == 'webchat') {   // 每一通 WebChat 的 User ID 都一樣，只能用 Conversation ID 區分
            session.userData.userId = session.message.address.conversation.id;
        } else {
            session.userData.userId = session.message.user.id;
        }
        preventDialog.set(session.userData.userId, JSON.stringify(global.dialogs[global.flow_id]));
        preventAddress.set(session.message.address.conversation.id, session.message.address);
        if (!preventMessage.has(session.userData.userId)) {
            var new_message = [];
            preventMessage.set(session.userData.userId, new_message);
        }
        session.beginDialog('/flow');
    }
    );

function ReplaceVariable(target, conversationData) {
    var start = -1;
    var end = -1;
    for (var index = 0; index < target.length; index++) {
        if (target.substr(index, 1) == '%') {
            if (start == -1) {
                start = index;
            } else {
                end = index;
                var variable = target.substr(start + 1, end - start - 1);
                if (conversationData.form[variable]) {
                    if (typeof (conversationData.form[variable]) == 'number') {
                        target = target.replace('%' + variable + '%', conversationData.form[variable]);
                        logger.debug('Replace %' + variable + '% to ' + conversationData.form[variable]);
                    } else if (typeof (conversationData.form[variable]) == 'string') {
                        target = target.replace('%' + variable + '%', conversationData.form[variable]);
                        logger.debug('Replace %' + variable + '% to ' + conversationData.form[variable]);
                    } else if (conversationData.form[variable].entity) {
                        target = target.replace('%' + variable + '%', conversationData.form[variable].entity);
                    } else {
                        continue;
                    }
                    start = -1;
                    end = -1;
                    index = 0;  // 因為 Replace 後 target 的長度會改變，所以重頭再掃一遍
                }
            }
        }
    }
    return target;
}

function ReplaceMessage(target, locale) {
    var start = -1;
    var end = -1;
    for (var index = 0; index < target.length; index++) {
        if (target.substr(index, 1) == '{') {
            start = index;
        } else if (target.substr(index, 1) == '}') {
            end = index;
            var message_id = target.substr(start + 1, end - start - 1);
            if (global.locales[global.flow_id][locale][message_id]) {
                logger.debug('Replace {' + message_id + '} to ' + global.locales[global.flow_id][locale][message_id]);
                target = target.replace('{' + message_id + '}', global.locales[global.flow_id][locale][message_id]);
                start = -1;
                end = -1;
                index = 0;  // 因為 Replace 後 target 的長度會改變，所以重頭再掃一遍
            }
        }
    }
    return target;
}

bot.dialog('/flow', [
    function (session, args) {
        session.userData.pre_flow_id = session.userData.flow_id[session.userData.flow_id.length - 1];
        var userDialog = JSON.parse(preventDialog.get(session.userData.userId));
        var userConversationMessage = preventMessage.get(session.userData.userId);
        logger.info('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        logger.info('Dialogs: ' + JSON.stringify(userDialog));
        logger.info('session conversationData: ' + JSON.stringify(session.conversationData));
        logger.info('session conversationData.Message: ' + JSON.stringify(userConversationMessage));
        logger.info('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        session.conversationData.index = args ? args.index : 0;

        if (session.conversationData.messageTimestamp != session.message.timestamp) {
            session.conversationData.messageTimestamp = session.message.timestamp;
            if (session.message.type == 'message' && session.message.attachments != undefined) {
                logger.info('session.message.text: ' + session.message.text);
                var message = session.message.text;
                try {
                    message = JSON.parse(session.message.text);
                } catch (e) {
                    logger.info('session.message.text is not JSON string');
                }
                if (session.message.attachments.length > 0) {
                    for (var index = 0; index < session.message.attachments.length; index++) {
                        var resource = {};
                        if (session.message.attachments[index].contentType.indexOf('image') >= 0) {
                            resource.Type = 'Image';
                            resource.Content = session.message.attachments[index].contentUrl;
                            userConversationMessage.push({ type: 'resource', acct: session.userData.userId, resource: resource });
                        } else if (session.message.attachments[index].contentType.indexOf('video') >= 0) {
                            resource.Type = 'Image';
                            resource.Content = session.message.attachments[index].contentUrl;
                            userConversationMessage.push({ type: 'resource', acct: session.userData.userId, resource: resource });
                        }
                    }
                }
                if (session.message.entities.length > 0) {
                    for (var index = 0; index < session.message.entities.length; index++) {
                        var location = {};
                        if (session.message.entities[index].type == 'Place') {
                            location.latitude = session.message.entities[index].geo.latitude;
                            location.longitude = session.message.entities[index].geo.longitude;
                            location.accuracy = 0;
                            userConversationMessage.push({ type: 'location', acct: session.userData.userId, location: location });
                        } else if (session.message.entities[index].type == 'clientInfo') {
                        }
                    }
                }
                if (typeof (message) == 'object') {  // for Direct Line
                    if (message.type == 'image') {
                        var resource = {};
                        resource.Type = 'Image';
                        resource.Content = message.url;
                        userConversationMessage.push({ type: 'resource', acct: session.userData.userId, resource: resource });
                    } else if (message.type == 'audio') {
                        var resource = {};
                        resource.Type = 'Audio';
                        resource.Content = message.url;
                        userConversationMessage.push({ type: 'resource', acct: session.userData.userId, resource: resource });
                    } else if (message.type == 'video') {
                        var resource = {};
                        resource.Type = 'Video';
                        resource.Content = message.url;
                        userConversationMessage.push({ type: 'resource', acct: session.userData.userId, resource: resource });
                    } else if (message.type == 'location') {
                        userConversationMessage.push({ type: 'location', acct: session.userData.userId, location: location });
                    }
                } else {
                    logger.info('send message to snapin, message is ' + session.message.text);
                    userConversationMessage.push({ type: 'message', acct: session.userData.userId, message: message });
                }
            }
        }

        if (args == undefined || args.form == undefined) {
            args = {},
            args.form = {};
            args.form['conversation_Id'] = session.message.address.conversation.id;
            args.form['dialog_Id'] = session.conversationData.index;
            args.form['user_Id'] = session.userData.userId;
            for (var idx = 0; idx < global.variables[global.flow_id].length; idx++) {
                args.form[global.variables[global.flow_id][idx].name] = global.variables[global.flow_id][idx].content;
            }
        }
        session.conversationData.form = args ? args.form : {};
        if (args.form['dialog_Id'] != session.conversationData.index) args.form['dialog_Id'] = session.conversationData.index;

        logger.info('Dialog ID: ' + session.conversationData.index + ', Description: ' + userDialog[session.conversationData.index].description);

        if (sessions.containsKey(session.userData.userId)) {
            sessions.remove(session.userData.userId);
        }
        sessions.add(session.userData.userId, session);
        session.userData._updateTime = new Date();

        var dialog = userDialog[session.conversationData.index];
        var dialogs_for_id = userDialog;
        session.conversationData.description = dialog.description;
        // 還原 Dialog 的文字內容，讓變數與訊息可以被重新置換
        if (dialog.prompt) {
            if (dialog._prompt) {
                dialog.prompt = JSON.parse(JSON.stringify(dialog._prompt));
            } else {
                dialog._prompt = JSON.parse(JSON.stringify(dialog.prompt));
            }
        }
        if (dialog.condition) {
            if (dialog._condition) {
                dialog.condition = JSON.parse(JSON.stringify(dialog._condition));
            } else {
                dialog._condition = JSON.parse(JSON.stringify(dialog.condition));
            }
        }
        if (dialog.operate) {
            if (dialog._operate) {
                dialog.operate = JSON.parse(JSON.stringify(dialog._operate));
            } else {
                dialog._operate = JSON.parse(JSON.stringify(dialog.operate));
            }
        }
        if (dialog.qna_maker) {
            if (dialog._qna_maker) {
                dialog.qna_maker = JSON.parse(JSON.stringify(dialog._qna_maker));
            } else {
                dialog._qna_maker = JSON.parse(JSON.stringify(dialog.qna_maker));
            }
        }

        // 取代變數
        if (typeof (dialog.prompt) == 'string' && dialog.prompt.indexOf('%') > -1) {
            dialog.prompt = ReplaceVariable(dialog.prompt, session.conversationData);
        }
        if (dialog.prompt && dialog.prompt.attachments) {
            if (typeof (dialog.prompt.attachments[0].content.title) == 'string' && dialog.prompt.attachments[0].content.title.indexOf('%') > -1) {
                dialog.prompt.attachments[0].content.title = ReplaceVariable(dialog.prompt.attachments[0].content.title, session.conversationData);
            }
            if (typeof (dialog.prompt.attachments[0].content.subtitle) == 'string' && dialog.prompt.attachments[0].content.subtitle.indexOf('%') > -1) {
                dialog.prompt.attachments[0].content.subtitle = ReplaceVariable(dialog.prompt.attachments[0].content.subtitle, session.conversationData);
            }
            if (typeof (dialog.prompt.attachments[0].content.text) == 'string' && dialog.prompt.attachments[0].content.text.indexOf('%') > -1) {
                dialog.prompt.attachments[0].content.text = ReplaceVariable(dialog.prompt.attachments[0].content.text, session.conversationData);
            }
            if (typeof (dialog.prompt.attachments[0].content.images) == 'object') {
                for (var index = 0; index < dialog.prompt.attachments[0].content.images.length; index++) {
                    if (typeof (dialog.prompt.attachments[0].content.images[index].url) == 'string' && dialog.prompt.attachments[0].content.images[index].url.indexOf('%') > -1) {
                        dialog.prompt.attachments[0].content.images[index].url = ReplaceVariable(dialog.prompt.attachments[0].content.images[index].url, session.conversationData);
                    }
                }
            }
            if (typeof (dialog.prompt.attachments[0].content.buttons) == 'object') {
                for (var index = 0; index < dialog.prompt.attachments[0].content.buttons.length; index++) {
                    if (typeof (dialog.prompt.attachments[0].content.buttons[index].title) == 'string' && dialog.prompt.attachments[0].content.buttons[index].title.indexOf('%') > -1) {
                        dialog.prompt.attachments[0].content.buttons[index].title = ReplaceVariable(dialog.prompt.attachments[0].content.buttons[index].title, session.conversationData);
                    }
                }
            }
        }

        // 取代訊息
        if (session.userData['locale']) {
            if (typeof (dialog.prompt) == 'string' && dialog.prompt.indexOf('{') > -1) {
                dialog.prompt = ReplaceMessage(dialog.prompt, session.userData['locale']);
            }
            if (dialog.prompt && dialog.prompt.attachments) {
                if (typeof (dialog.prompt.attachments[0].content.title) == 'string' && dialog.prompt.attachments[0].content.title.indexOf('{') > -1) {
                    dialog.prompt.attachments[0].content.title = ReplaceMessage(dialog.prompt.attachments[0].content.title, session.userData['locale']);
                }
                if (typeof (dialog.prompt.attachments[0].content.subtitle) == 'string' && dialog.prompt.attachments[0].content.subtitle.indexOf('{') > -1) {
                    dialog.prompt.attachments[0].content.subtitle = ReplaceMessage(dialog.prompt.attachments[0].content.subtitle, session.userData['locale']);
                }
                if (typeof (dialog.prompt.attachments[0].content.text) == 'string' && dialog.prompt.attachments[0].content.text.indexOf('{') > -1) {
                    dialog.prompt.attachments[0].content.text = ReplaceMessage(dialog.prompt.attachments[0].content.text, session.userData['locale']);
                }
                if (typeof (dialog.prompt.attachments[0].content.images) == 'object') {
                    for (var index = 0; index < dialog.prompt.attachments[0].content.images.length; index++) {
                        if (typeof (dialog.prompt.attachments[0].content.images[index].url) == 'string' && dialog.prompt.attachments[0].content.images[index].url.indexOf('{') > -1) {
                            dialog.prompt.attachments[0].content.images[index].url = ReplaceMessage(dialog.prompt.attachments[0].content.images[index].url, session.userData['locale']);
                        }
                    }
                }
                if (typeof (dialog.prompt.attachments[0].content.buttons) == 'object') {
                    for (var index = 0; index < dialog.prompt.attachments[0].content.buttons.length; index++) {
                        if (typeof (dialog.prompt.attachments[0].content.buttons[index].title) == 'string' && dialog.prompt.attachments[0].content.buttons[index].title.indexOf('{') > -1) {
                            dialog.prompt.attachments[0].content.buttons[index].title = ReplaceMessage(dialog.prompt.attachments[0].content.buttons[index].title, session.userData['locale']);
                        }
                    }
                }
            }
        }
        if (dialog.type == 'text') {
            logger.info('session.send: ' + JSON.stringify(dialog.prompt));
            session.send(dialog.prompt);
            userConversationMessage.push({ type: 'message', acct: 'flowbot', message: dialog.prompt });
            preventMessage.set(session.userData.userId, userConversationMessage);
            // session.conversationData.index++;
            if (dialog.next < 0) session.conversationData.index = dialog.next;
            else session.conversationData.index = dialog.next_id;
            logger.info('index: ' + session.conversationData.index);
            var redirect = redirect_dialog(session, dialog);
            if (redirect == 'endDialog') {
                //session.endDialogWithResult({ response: session.conversationData.form });
                if (session.message.address.channelId == 'directline') {
                    session.send('{ "action": "end_service" }');
                }
                session.replaceDialog('/end', session.conversationData);
            } else {
                session.replaceDialog(redirect, session.conversationData);
            }
        } else if (dialog.type == 'card') {
            session.send(dialog.prompt);
            userConversationMessage.push({ type: 'message', acct: 'flowbot', message: dialog.prompt });
            preventMessage.set(session.userData.userId, userConversationMessage);
            logger.info('session.send: ' + JSON.stringify(dialog.prompt));
            if (dialog.next < 0) session.conversationData.index = dialog.next;
            else session.conversationData.index = dialog.next_id;
            logger.info('index: ' + session.conversationData.index);
            var redirect = redirect_dialog(session, dialog);
            if (redirect == 'endDialog') {
                //session.endDialogWithResult({ response: session.conversationData.form });
                if (session.message.address.channelId == 'directline') {
                    session.send('{ "action": "end_service" }');
                }
                session.replaceDialog('/end', session.conversationData);
            } else {
                session.replaceDialog(redirect, session.conversationData);
            }
        } else if (dialog.type == 'input') {
            session.conversationData.status = "等待輸入中";
            try {
                dialog.prompt.attachments[0].content = JSON.parse(dialog.prompt.attachments[0].content);  // QnAMaker
            } catch (e) {
                // logger.error(e);
            }
            if (dialog.prompt.attachments[0].type == 'text') {
                session.conversationData.input_type = 'text';
                logger.info('dialog.prompt: ' + JSON.stringify(dialog.prompt.attachments[0].content));
                if (typeof (dialog.prompt.attachments[0].content) == 'object') {
                    for (var idx = 0; idx < dialog.prompt.attachments[0].content.length; idx++) {
                        var answer = dialog.prompt.attachments[0].content[idx];
                        if (answer.type == 'text') {
                            builder.Prompts.text(session, answer.message);
                        } else if (answer.type == 'choice') {
                            var IIsMessage = [];
                            for (var index = 0; index < answer.prompt.attachments[0].content.buttons.length; index++) {
                                IIsMessage.push(answer.prompt.attachments[0].content.buttons[index].value);
                            }
                            logger.info('builder.Prompts.choice: ' + JSON.stringify(answer));
                            builder.Prompts.choice(session, answer.prompt, IIsMessage.join('|'));
                            userConversationMessage.push({ type: 'message', acct: 'flowbot', message: answer.prompt });
                            preventMessage.set(session.userData.userId, userConversationMessage);
                        }
                    }
                } else {
                    builder.Prompts.text(session, dialog.prompt.attachments[0].content);
                    userConversationMessage.push({ type: 'message', acct: 'flowbot', message: dialog.prompt.attachments[0].content });
                    preventMessage.set(session.userData.userId, userConversationMessage);
                }
            } else if (dialog.prompt.attachments[0].type == 'image') {
                session.conversationData.input_type = 'image';
                session.conversationData.image_type = dialog.prompt.attachments[0].data;
                builder.Prompts.attachment(session, dialog.prompt.attachments[0].content);
                userConversationMessage.push({ type: 'message', acct: 'flowbot', message: dialog.prompt });
                preventMessage.set(session.userData.userId, userConversationMessage);
            }

        } else if (dialog.type == 'hanfei') {
            session.replaceDialog('/hanfei');
        } else if (dialog.type == 'choice') {
            session.conversationData.status = "等待使用者選擇";
            var IIsMessage = [];
            for (var index = 0; index < dialog.prompt.attachments[0].content.buttons.length; index++) {
                IIsMessage.push(dialog.prompt.attachments[0].content.buttons[index].value);
            }
            logger.info('builder.Prompts.choice: ' + JSON.stringify(dialog.prompt));
            var card = createHeroCard(session, dialog.prompt);
            var msg = new builder.Message(session).addAttachment(card);
            //session.send(msg);
            builder.Prompts.choice(session, msg, IIsMessage.join('|'), { retryPrompt: msg });
            userConversationMessage.push({ type: 'message', acct: 'flowbot', message: dialog.prompt });
            preventMessage.set(session.userData.userId, userConversationMessage);
        } else if (dialog.type == 'confirm') {
            session.conversationData.status = "等待使用者確認";
            logger.info('builder.Prompts.confirm: ' + JSON.stringify(dialog.prompt));
            builder.Prompts.confirm(session, dialog.prompt, { maxRetries: 3, retryPrompt: '請重新輸入' });
            userConversationMessage.push({ type: 'message', acct: 'flowbot', message: dialog.prompt });
            preventMessage.set(session.userData.userId, userConversationMessage);
        } else if (dialog.type == 'condition') {
            var success = false;
            var target_field;
            if (dialog.condition.target_type == '0') {
                target_field = dialog.condition.target_field;
            } else {
                target_field = session.conversationData.form[dialog.condition.target_field];
            }
            switch (dialog.condition.type) {
                case '0':
                    if (session.conversationData.form[dialog.condition.field] < target_field) {
                        success = true;
                    }
                    break;
                case '1':
                    if (session.conversationData.form[dialog.condition.field] <= target_field) {
                        success = true;
                    }
                    break;
                case '2':
                    if (session.conversationData.form[dialog.condition.field] == target_field) {
                        success = true;
                    }
                    break;
                case '3':
                    if (session.conversationData.form[dialog.condition.field] >= target_field) {
                        success = true;
                    }
                    break;
                case '4':
                    if (session.conversationData.form[dialog.condition.field] > target_field) {
                        success = true;
                    }
                    break;
            }
            if (success) {
                var success_dialog_id;
                if (dialog.condition.success_dialog_id < 0) {
                    success_dialog_id = dialog.condition.success_dialog_id;
                } else {
                    for (var i = 0; i < dialogs_for_id.length; i++) {
                        if (dialogs_for_id[i].dialog_uuid == dialog.condition.success_dialog_id) {
                            success_dialog_id = dialogs_for_id[i].dialog_id;
                            break;
                        }
                    }
                }
                session.conversationData.index = success_dialog_id;
            } else {
                var fail_dialog_id;
                if (dialog.condition.fail_dialog_id < 0) {
                    fail_dialog_id = dialog.condition.fail_dialog_id;
                } else {
                    for (var i = 0; i < dialogs_for_id.length; i++) {
                        if (dialogs_for_id[i].dialog_uuid == dialog.condition.fail_dialog_id) {
                            fail_dialog_id = dialogs_for_id[i].dialog_id;
                            break;
                        }
                    }
                }
                session.conversationData.index = fail_dialog_id;
            }
            var redirect = redirect_dialog(session, dialog);
            if (redirect == 'endDialog') {
                //session.endDialogWithResult({ response: session.conversationData.form });
                if (session.message.address.channelId == 'directline') {
                    session.send('{ "action": "end_service" }');
                }
                session.replaceDialog('/end', session.conversationData);
            } else {
                session.replaceDialog(redirect, session.conversationData);
            }
        } else if (dialog.type == 'operate') {
            if (dialog.operate) {
                if (dialog.operate.indexOf('{') > -1) {
                    dialog.operate = ReplaceMessage(dialog.operate, session.userData['locale']);
                }
                if (dialog.operate.indexOf('%') > -1) {
                    dialog.operate = ReplaceVariable(dialog.operate, session.conversationData);
                }
                try {
                    eval(dialog.operate);
                } catch (e) {
                    if (e instanceof SyntaxError) {
                        logger.error(e);
                    }
                }
            }
            // eval('session.conversationData.form["' + dialog.field + '"] = ' + dialog.operate);
            if (dialog.next < 0) session.conversationData.index = dialog.next;
            else session.conversationData.index = dialog.next_id;
            var redirect = redirect_dialog(session, dialog);
            if (redirect == 'endDialog') {
                //session.endDialogWithResult({ response: session.conversationData.form });
                if (session.message.address.channelId == 'directline') {
                    session.send('{ "action": "end_service" }');
                }
                session.replaceDialog('/end', session.conversationData);
            } else {
                session.replaceDialog(redirect, session.conversationData);
            }
        } else if (dialog.type == 'webapi') {
            session.conversationData.status = "等待api回復";
            var http;
            if (dialog.webapi.protocol == 'http') {
                http = require('http');
            } else {
                http = require('https');
            }
            var path = dialog.webapi.path;
            path = ReplaceVariable(path, session.conversationData);
            path = encodeURI(path);
            var options = {
                host: dialog.webapi.host,
                port: dialog.webapi.port,
                path: '/' + path,
                headers: {},
                method: dialog.webapi.method.toUpperCase()
            };
            if (dialog.webapi.method == 'post' || dialog.webapi.method == 'put') {
                for (var idx = 0; idx < dialog.webapi.headers.length; idx++) {
                    var header = dialog.webapi.headers[idx].value;
                    header = ReplaceVariable(header, session.conversationData);
                    options.headers[dialog.webapi.headers[idx].name] = header;
                }
                var body = dialog.webapi.body;
                body = ReplaceVariable(body, session.conversationData);
                options.headers['Content-Length'] = new Buffer(body).length;
            }
            var req = http.request(options, function (res) {
                logger.info('STATUS: ' + res.statusCode);
                logger.info('HEADERS: ' + JSON.stringify(res.headers));
                res.setEncoding('utf8');
                res.body = '';
                res.on('data', function (chunk) {
                    logger.info('BODY: ' + chunk);
                    res.body = res.body + chunk;
                });
                res.on('end', function () {
                    logger.info('REQUEST END');
                    try {
                        var result = res.body;
                        var msg = getAPIResult(result, session);
                        if (msg && msg != 'flow') session.send(msg);
                        else if (msg == 'flow') return;
                        /**
                         * 在此放讀json格式的function
                         */
                        else {
                            this.session.conversationData.form[this.userDialog[this.session.conversationData.index].field] = result;
                        }
                    } catch (e) {
                        logger.error(e);
                        this.session.conversationData.form[this.userDialog[this.session.conversationData.index].field] = e.message;
                    }
                    if (this.userDialog[this.session.conversationData.index].next < 0) this.session.conversationData.index = this.userDialog[this.session.conversationData.index].next;
                    else this.session.conversationData.index = this.userDialog[this.session.conversationData.index].next_id;
                    var redirect = redirect_dialog(this.session, this.dialog);
                    if (redirect == 'endDialog') {
                        //this.session.endDialogWithResult({ response: this.session.conversationData.form });
                        if (this.session.message.address.channelId == 'directline') {
                            this.session.send('{ "action": "end_service" }');
                        }
                        this.session.replaceDialog('/end', this.session.conversationData);
                    } else {
                        this.session.replaceDialog(redirect, this.session.conversationData);
                    }
                }.bind({ session: this.session, dialog: this.dialog, userDialog: this.userDialog }));
            }.bind({ session: session, dialog: dialog, userDialog: userDialog }));
            req.on('error', function (e) {
                logger.error(e);
                this.session.conversationData.form[this.userDialog[this.session.conversationData.index].field] = e.message;
                if (this.userDialog[this.session.conversationData.index].next < 0) this.session.conversationData.index = this.userDialog[this.session.conversationData.index].next;
                else this.session.conversationData.index = this.userDialog[this.session.conversationData.index].next_id;
                var redirect = redirect_dialog(this.session, this.dialog);
                if (redirect == 'endDialog') {
                    //this.session.endDialogWithResult({ response: this.session.conversationData.form });
                    if (this.session.message.address.channelId == 'directline') {
                        this.session.send('{ "action": "end_service" }');
                    }
                    this.session.replaceDialog('/end', this.session.conversationData);
                } else {
                    this.session.replaceDialog(redirect, this.session.conversationData);
                }
            }.bind({ session: session, dialog: dialog, userDialog: userDialog }));
            if (dialog.webapi.method == 'post' || dialog.webapi.method == 'put') {
                req.write(body);
            }
            req.end();
        } else if (dialog.type == 'qna_maker') {
            session.conversationData.status = "等待QA回復";
            /** LUIS */
            logger.info('To LUIS: ' + ReplaceVariable(dialog.qna_maker.problem, session.conversationData));
            var https = require('https');
            var options = {
                host: 'westus.api.cognitive.microsoft.com',
                port: 443,
                path: '/luis/v2.0/apps/' + config.luis_code + '?subscription-key=' + config.luis_key + '&verbose=true&timezoneOffset=0&q=' + encodeURI(ReplaceVariable(dialog.qna_maker.problem, session.conversationData)),
                method: 'GET'
            };
            logger.info('https://' + options.host + ':' + options.port + options.path);
            var req = https.request(options, function (res) {
                logger.info('STATUS: ' + res.statusCode);
                logger.info('HEADERS: ' + JSON.stringify(res.headers));
                res.setEncoding('utf8');
                res.body = '';
                res.on('data', function (chunk) {
                    logger.info('BODY: ' + chunk);
                    res.body = res.body + chunk;
                });
                res.on('end', function () {
                    logger.info('REQUEST END');
                    var result = {};
                    try {
                        result = JSON.parse(res.body);
                        var intent, entity, score;
                        if (result.topScoringIntent) {
                            intent = result.topScoringIntent.intent;
                            score = result.topScoringIntent.score;

                            if (intent != 'None') {
                                if (result.entities != undefined && result.entities.length > 0) {
                                    entity = result.entities[0].entity;
                                    if (result.entities[0].resolution && result.entities[0].resolution.values && result.entities[0].resolution.values.length > 0) {
                                        entity = result.entities[0].resolution.values[0];
                                    }
                                }
                                this.dialog.qna_maker.problem = intent + '_' + entity;
                            }
                            logger.info('From LUIS: ' + this.dialog.qna_maker.problem);
                        }
                    } catch (e) {
                    }

                    /** QnA Maker */
                    var https = require('https');
                    var options = {
                        host: 'westus.api.cognitive.microsoft.com',
                        port: 443,
                        path: '/qnamaker/v2.0/knowledgebases/' + this.dialog.qna_maker.code + '/generateAnswer',
                        headers: {
                            'Ocp-Apim-Subscription-Key': this.dialog.qna_maker.key,
                            'Content-Type': 'application/json'
                        },
                        method: 'POST'
                    };

                    this.dialog.qna_maker.body = {
                        'question': ReplaceVariable(this.dialog.qna_maker.problem, this.session.conversationData)
                    };
                    logger.info('qna_maker_body: ' + JSON.stringify(this.dialog.qna_maker.body));
                    logger.info('To QnAMaker: ' + this.dialog.qna_maker.body.question);
                    var length = Buffer.byteLength(JSON.stringify(this.dialog.qna_maker.body), 'utf8')
                    options.headers['Content-Length'] = length;
                    var req = https.request(options, function (res) {
                        logger.info('STATUS: ' + res.statusCode);
                        logger.info('HEADERS: ' + JSON.stringify(res.headers));
                        res.setEncoding('utf8');
                        res.body = '';
                        res.on('data', function (chunk) {
                            logger.info('BODY: ' + chunk);
                            res.body = res.body + chunk;
                        });
                        res.on('end', function () {
                            logger.info('REQUEST END');
                            var result = {};
                            try {
                                try {
                                    result = JSON.parse(res.body);
                                    if (result.answers) {
                                        if (result.answers.length > 0) {
                                            if (result.answers[0].score > 0) {
                                                try {
                                                    var answers = JSON.parse(result.answers[0].answer.replaceAll('&quot;', '"'));
                                                    if (typeof (answers) == 'object') {
                                                        result.answer = JSON.stringify(answers);
                                                    } else {
                                                        result.answer = result.answers[0].answer;
                                                    }
                                                } catch (e) {
                                                    result.answer = result.answers[0].answer;
                                                }
                                            } else {
                                                result.answer = '對不起，我不懂您的意思';
                                            }
                                        } else {
                                            result.answer = '對不起，我不懂您的意思';
                                        }
                                    } else {
                                        result.answer = '對不起，我不懂您的意思';
                                    }
                                } catch (e) {
                                }
                                console.log('------------------ ' + result.answer);
                                this.session.conversationData.form[this.userDialog[this.session.conversationData.index].field] = result.answer;
                            } catch (e) {
                                logger.error(e);
                                this.session.conversationData.form[this.userDialog[this.session.conversationData.index].field] = e.message;
                            }
                            if (this.userDialog[this.session.conversationData.index].next < 0) this.session.conversationData.index = this.userDialog[this.session.conversationData.index].next;
                            else this.session.conversationData.index = this.userDialog[this.session.conversationData.index].next_id;
                            var redirect = redirect_dialog(this.session, this.dialog);
                            if (redirect == 'endDialog') {
                                //this.session.endDialogWithResult({ response: this.session.conversationData.form });
                                if (this.session.message.address.channelId == 'directline') {
                                    this.session.send('{ "action": "end_service" }');
                                }
                                this.session.replaceDialog('/end', this.session.conversationData);
                            } else {
                                this.session.replaceDialog(redirect, this.session.conversationData);
                            }
                        }.bind({ session: this.session, dialog: this.dialog, userDialog: this.userDialog }));
                    }.bind({ session: this.session, dialog: this.dialog, userDialog: this.userDialog }));
                    req.on('error', function (e) {
                        logger.error(e);
                        this.session.conversationData.form[this.userDialog[this.session.conversationData.index].field] = e.message;
                        if (this.userDialog[this.session.conversationData.index].next < 0) this.session.conversationData.index = this.userDialog[this.session.conversationData.index].next;
                        else this.session.conversationData.index = this.userDialog[this.session.conversationData.index].next_id;
                        var redirect = redirect_dialog(this.session, this.dialog);
                        if (redirect == 'endDialog') {
                            //this.session.endDialogWithResult({ response: this.session.conversationData.form });
                            if (this.session.message.address.channelId == 'directline') {
                                this.session.send('{ "action": "end_service" }');
                            }
                            this.session.replaceDialog('/end', this.session.conversationData);
                        } else {
                            this.session.replaceDialog(redirect, this.session.conversationData);
                        }
                    }.bind({ session: this.session, dialog: this.dialog, userDialog: this.userDialog }));
                    req.write(JSON.stringify(this.dialog.qna_maker.body));
                    req.end();



                }.bind({ session: this.session, dialog: this.dialog, userDialog: this.userDialog }));
            }.bind({ session: session, dialog: dialog, userDialog: userDialog }));
            req.on('error', function (e) {
                logger.error(e);
                this.session.conversationData.form[this.userDialog[this.session.conversationData.index].field] = e.message;
                if (this.userDialog[this.session.conversationData.index].next < 0) this.session.conversationData.index = this.userDialog[this.session.conversationData.index].next;
                else this.session.conversationData.index = this.userDialog[this.session.conversationData.index].next_id;
                var redirect = redirect_dialog(this.session, this.dialog);
                if (redirect == 'endDialog') {
                    //this.session.endDialogWithResult({ response: this.session.conversationData.form });
                    if (this.session.message.address.channelId == 'directline') {
                        this.session.send('{ "action": "end_service" }');
                    }
                    this.session.replaceDialog('/end', this.session.conversationData);
                } else {
                    this.session.replaceDialog(redirect, this.session.conversationData);
                }
            }.bind({ session: session, dialog: dialog, userDialog: userDialog }));
            req.end();
        }
    },
    function (session, results) {
        console.log("second flow dialog\n");
        session.userData._updateTime = new Date();
        var userDialog = JSON.parse(preventDialog.get(session.userData.userId));
        var dialog = userDialog[session.conversationData.index];
        var dialogs_for_id = userDialog;
        var field = dialog.field;
        logger.info('dialog type: ' + dialog.type);
        logger.info('index: ' + session.conversationData.index + ', field: ' + field + ', value: ' + results.response);
        if (results.response != undefined) {
            if (results.response == true || results.response == false) {
                session.conversationData.form[field] = results.response;
                logger.info('field value: ' + results.response);
            } else if (typeof (results.response) == 'string') {
                session.conversationData.form[field] = results.response;
                logger.info('field value: ' + results.response);
            } else {
                session.conversationData.form[field] = results.response.entity;
                logger.info('field value: ' + results.response.entity);
            }

            if (field == 'locale') {
                session.userData['locale'] = results.response.entity;
            }
            if (dialog.type == 'input') {
                console.log("input conversationData input_type: " + session.conversationData.input_type);
                if (session.conversationData.input_type == 'text') {
                    session.conversationData.form[userDialog[session.conversationData.index.field]] = results.response;
                    // session.conversationData.index++;
                    if (dialog.next < 0) session.conversationData.index = dialog.next;
                    else session.conversationData.index = dialog.next_id;
                } else if (session.conversationData.input_type == 'image') {
                    if (session.conversationData.image_type == 'url') {
                        session.conversationData.form[userDialog[session.conversationData.index.field]] = results.response[0].contentUrl;
                    } else if (session.conversationData.image_type == 'base64') {
                        for (var index = 0; index < session.message.attachments.length; index++) {
                            var resource = {};
                            if (session.message.attachments[index].contentType.indexOf('image') >= 0) {
                                get_picture(results.response[0].contentUrl, session.message, session.message.attachments[index], function (image_file) {
                                    session.conversationData.form[userDialog[session.conversationData.index.field]] = image_file;
                                });
                            }
                        }
                    } else {
                        logger.info("不好意思，您沒有選擇要存入何種型態");
                    }
                    if (dialog.next < 0) session.conversationData.index = dialog.next;
                    else session.conversationData.index = dialog.next_id;
                }
            } else if (dialog.type == 'choice') {
                /**
                var exist = false;
                for (var choice = 0; choice < dialog.prompt.attachments[0].content.buttons.length; choice++) {
                    if (dialog.prompt.attachments[0].content.buttons[choice].value == results.response.entity) {
                        session.conversationData.index = dialog.prompt.attachments[0].content.buttons[choice].dialog_id;
                        exist = true;
                        break;
                    }
                }
                if (!exist) {
                    session.conversationData.index++;
                }
                **/
                var dialog_id_choice;
                if (dialog.prompt.attachments[0].content.buttons[results.response.index].dialog_id < 0) {
                    dialog_id_choice = dialog.prompt.attachments[0].content.buttons[results.response.index].dialog_id;
                } else {
                    for (var i = 0; i < dialogs_for_id.length; i++) {
                        if (dialogs_for_id[i].dialog_uuid == dialog.prompt.attachments[0].content.buttons[results.response.index].dialog_id) {
                            dialog_id_choice = dialogs_for_id[i].dialog_id;
                            break;
                        }
                    }
                }
                session.conversationData.index = dialog_id_choice;
            } else if (dialog.type == 'confirm') {

                // Confirm 的 Button 需固定第一個為 YES
                if (results.response) {
                    var dialog_id_confirm;
                    if (dialog.prompt.attachments[0].content.buttons[0].dialog_id == -2 || dialog.prompt.attachments[0].content.buttons[0].dialog_id == -3) {
                        dialog_id_confirm = dialog.prompt.attachments[0].content.buttons[0].dialog_id;
                    } else {
                        for (var i = 0; i < dialogs_for_id.length; i++) {
                            if (dialogs_for_id[i].dialog_uuid == dialog.prompt.attachments[0].content.buttons[0].dialog_id) {
                                dialog_id_confirm = dialogs_for_id[i].dialog_id;
                                break;
                            }
                        }
                    }
                    session.conversationData.index = dialog_id_confirm;
                } else {
                    var dialog_id_confirm;
                    if (dialog.prompt.attachments[0].content.buttons[1].dialog_id == -2 || dialog.prompt.attachments[0].content.buttons[1].dialog_id == -3) {
                        dialog_id_confirm = dialog.prompt.attachments[0].content.buttons[1].dialog_id;
                    } else {
                        for (var i = 0; i < dialogs_for_id.length; i++) {
                            if (dialogs_for_id[i].dialog_uuid == dialog.prompt.attachments[0].content.buttons[1].dialog_id) {
                                dialog_id_confirm = dialogs_for_id[i].dialog_id;
                                break;
                            }
                        }
                    }
                    session.conversationData.index = dialog_id_confirm;
                }
            }
            var redirect = redirect_dialog(session, dialog);
            if (redirect == 'endDialog') {
                //session.endDialogWithResult({ response: session.conversationData.form });
                if (session.message.address.channelId == 'directline') {
                    session.send('{ "action": "end_service" }');
                }
                session.replaceDialog('/end', session.conversationData);
            } else {
                session.replaceDialog(redirect, session.conversationData);
            }
        } else {
            session.endConversation();
            if (session.message.address.channelId == 'directline') {
                session.send('{ "action": "end_service" }');
            }
            // session.send('很抱歉，由於您的輸入連續出錯，請下次再來訪，謝謝');
            session.userData.status = undefined;
            session.userData._updateTime = undefined;
            // session.endDialogWithResult({ response: session.conversationData.form });
        }
    }
]);

bot.dialog('/transfer', function (session) {
    var userConversationMessage = preventMessage.get(session.userData.userId);
    logger.info('================================');
    logger.info('/transfer session conversationData: ' + JSON.stringify(session.conversationData));
    logger.info('================================');
    if (sessions.containsKey(session.userData.userId)) {
        sessions.remove(session.userData.userId);
    }
    sessions.add(session.userData.userId, session);
    session.userData._updateTime = new Date();
    if (session.userData.status == undefined) {
        session.userData.status = 'register';
        session.send(locales[session.userData.pre_flow_id][session.userData.locale]['menu_transfer']);
        userConversationMessage.push({ type: 'message', acct: 'flowbot', message: locales[session.userData.pre_flow_id][session.userData.locale]['menu_transfer'] });
        preventMessage.set(session.userData.userId, userConversationMessage);
        var snapin = snapins.get(session.userData.snapin_name);
        var queue = snapin_queue.get(session.userData.snapin_name);
        if (snapin != undefined) {
            logger.info('Rigster user ' + session.userData.userId + '(' + session.message.user.name + ')');
            snapin.emit('register', session.userData.userId, session.message.user.name, { head_img_url: session.message.user.head_img_url });
        }
        if (queue != undefined) {
            logger.info('Rigster user ' + session.userData.userId + '(' + session.message.user.name + ')');
            var message = {
                type: 'register',
                acct: session.userData.userId,
                nick_name: session.message.user.name,
                attribute: { head_img_url: session.message.user.head_img_url }
            };
            queue.push(message);
        }
        if (snapin == undefined && queue == undefined) {
            logger.info('Snapin [' + session.userData.snapin_name + '] 不存在');
            session.send('很抱歉，目前客服人員都在忙線中，為了節省您寶貴的時間，請稍後再來訪，謝謝');
            userConversationMessage.push({ type: 'message', acct: 'flowbot', message: '很抱歉，目前客服人員都在忙線中，為了節省您寶貴的時間，請稍後再來訪，謝謝' });
            preventMessage.set(session.userData.userId, userConversationMessage);
            session.userData.status = undefined;
            session.userData._updateTime = undefined;
            session.beginDialog('/end');
        }
    } else {
        logger.info('session.userData.status: ' + session.userData.status);
        if (!sessions.containsKey(session.userData.userId)) {
            logger.info('Found lose session - ' + session.userData.userId);
            logger.info('Send end dialog to session');
            // session.send('很抱歉，系統發生無法預期的錯誤，請您重新發送新的訊息，謝謝');
            session.userData.status = undefined;
            session.userData._updateTime = undefined;
            session.beginDialog('/end');
        }
        if (session.userData.status == 'answered' ||
            session.userData.status == 'ringing' ||
            session.userData.status == 'start_service') {
            logger.info('session.message: ' + JSON.stringify(session.message));
            if (session.message.type == 'message') {
                var snapin = snapins.get(session.userData.snapin_name);
                var queue = snapin_queue.get(session.userData.snapin_name);
                if (snapin != undefined) {
                    logger.info('session.message.text: ' + session.message.text);
                    var message = session.message.text;
                    try {
                        message = JSON.parse(session.message.text);
                    } catch (e) {
                        logger.info('session.message.text is not JSON string');
                    }
                    if (session.message.attachments.length > 0) {
                        for (var index = 0; index < session.message.attachments.length; index++) {
                            var resource = {};
                            if (session.message.attachments[index].contentType.indexOf('image') >= 0) {
                                resource.Type = 'Image';
                                resource.Content = session.message.attachments[index].contentUrl;
                                snapin.emit('resource', session.userData.userId, resource);
                            } else if (session.message.attachments[index].contentType.indexOf('video') >= 0) {
                                resource.Type = 'Image';
                                resource.Content = session.message.attachments[index].contentUrl;
                                snapin.emit('resource', session.userData.userId, resource);
                            }
                        }
                    }
                    if (session.message.entities.length > 0) {
                        for (var index = 0; index < session.message.entities.length; index++) {
                            var location = {};
                            if (session.message.entities[index].type == 'Place') {
                                location.latitude = session.message.entities[index].geo.latitude;
                                location.longitude = session.message.entities[index].geo.longitude;
                                snapin.emit('location', session.userData.userId, location.latitude, location.longitude, 1);
                            } else if (session.message.entities[index].type == 'clientInfo') {
                            }
                        }
                    }
                    if (typeof (message) == 'object') {  // for Direct Line
                        if (message.type == 'image') {
                            var resource = {};
                            resource.Type = 'Image';
                            resource.Content = message.url;
                            snapin.emit('resource', session.userData.userId, resource);
                        } else if (message.type == 'audio') {
                            var resource = {};
                            resource.Type = 'Audio';
                            resource.Content = message.url;
                            snapin.emit('resource', session.userData.userId, resource);
                        } else if (message.type == 'video') {
                            var resource = {};
                            resource.Type = 'Video';
                            resource.Content = message.url;
                            snapin.emit('resource', session.userData.userId, resource);
                        } else if (message.type == 'location') {
                            snapin.emit('location', session.userData.userId, message.latitude, message.longitude, 0);
                        }
                    } else {
                        logger.info('send message to snapin, message is ' + session.message.text);
                        snapin.emit('message', session.userData.userId, session.message.text);
                    }
                }
                if (queue != undefined) {
                    logger.info('session.message.text: ' + session.message.text);
                    var message = session.message.text;
                    try {
                        message = JSON.parse(session.message.text);
                    } catch (e) {
                        logger.info('session.message.text is not JSON string');
                    }
                    if (session.message.attachments.length > 0) {
                        for (var index = 0; index < session.message.attachments.length; index++) {
                            var resource = {};
                            if (session.message.attachments[index].contentType.indexOf('image') >= 0) {
                                resource.Type = 'Image';
                                resource.Content = session.message.attachments[index].contentUrl;
                                queue.push({ type: 'resource', acct: session.userData.userId, resource: resource });
                            } else if (session.message.attachments[index].contentType.indexOf('video') >= 0) {
                                resource.Type = 'Image';
                                resource.Content = session.message.attachments[index].contentUrl;
                                queue.push({ type: 'resource', acct: session.userData.userId, resource: resource });
                            }
                        }
                    }
                    if (session.message.entities.length > 0) {
                        for (var index = 0; index < session.message.entities.length; index++) {
                            var location = {};
                            if (session.message.entities[index].type == 'Place') {
                                location.latitude = session.message.entities[index].geo.latitude;
                                location.longitude = session.message.entities[index].geo.longitude;
                                location.accuracy = 0;
                                queue.push({ type: 'location', acct: session.userData.userId, location: location });
                            } else if (session.message.entities[index].type == 'clientInfo') {
                            }
                        }
                    }
                    if (typeof (message) == 'object') {  // for Direct Line
                        if (message.type == 'image') {
                            var resource = {};
                            resource.Type = 'Image';
                            resource.Content = message.url;
                            queue.push({ type: 'resource', acct: session.userData.userId, resource: resource });
                        } else if (message.type == 'audio') {
                            var resource = {};
                            resource.Type = 'Audio';
                            resource.Content = message.url;
                            queue.push({ type: 'resource', acct: session.userData.userId, resource: resource });
                        } else if (message.type == 'video') {
                            var resource = {};
                            resource.Type = 'Video';
                            resource.Content = message.url;
                            queue.push({ type: 'resource', acct: session.userData.userId, resource: resource });
                        } else if (message.type == 'location') {
                            var location = {};
                            location.latitude = message.latitude;
                            location.longitude = message.longitude;
                            location.accuracy = 0;
                            queue.push({ type: 'location', acct: session.userData.userId, latitude: message.latitude, longitude: message.longitude, accuracy: 0 });
                        }
                    } else {
                        logger.info('send message to snapin, message is ' + session.message.text);
                        queue.push({ type: 'message', acct: session.userData.userId, message: message });
                    }
                }
                /**
                PostWebHook(webchat_webhook, '/message/' + session.message.user.id, { message: session.message.text }, function (result) {
                });
                **/
            }
        }
    }
});

bot.dialog('/end', function (session) {
    logger.info("/end----------------------------------------------");
    var userConversationMessage = preventMessage.get(session.userData.userId);
    //logger.info("locales: " + JSON.stringify(locales));
    session.send(locales[session.userData.pre_flow_id][session.userData.locale]['finished']);
    userConversationMessage.push({ type: 'message', acct: 'flowbot', message: locales[session.userData.pre_flow_id][session.userData.locale]['finished'] });
    preventMessage.set(session.userData.userId, userConversationMessage);
    // 20170321 告知 Social Gateway
    if (session.message.address.channelId == 'directline') {
        session.send('{ "action": "end_service" }');
    }
    session.userData.status = undefined;
    session.userData._updateTime = undefined;
    preventDialog.delete(session.userData.userId);
    preventMessage.delete(session.userData.userId);
    preventAddress.delete(session.message.address.conversation.id);
    if (sessions.containsKey(session.userData.userId)) {
        sessions.remove(session.userData.userId);
    }
    // session.endDialog();
    session.endConversation();
});

bot.dialog('/stay', [
    function (session, args) {
        var message = '此服務需一段時間，請稍等一下';
        session.send(message);
    },
    function (session, args) {
        session.replaceDialog("/stay", session.conversationData);
    }
]);

var checkRequiresToken = function (message) {
    return message.source === 'skype' || message.source === 'msteams';
};

bot.dialog('/hanfei', function (session) {
    var userDialog = JSON.parse(preventDialog.get(session.userData.userId));
    var dialog = userDialog[session.conversationData.index];
    if (session.message.text != '') {
        post_Hanfei(session.message.text, session, userDialog, function (isOK) {
            session.message.text = '';
            if (isOK) {
                if (dialog.next < 0) session.conversationData.index = dialog.next;
                else session.conversationData.index = dialog.next_id;
                var redirect = redirect_dialog(session, dialog);
                if (redirect == 'endDialog') {
                    //session.endDialogWithResult({ response: session.conversationData.form });
                    if (session.message.address.channelId == 'directline') {
                        session.send('{ "action": "end_service" }');
                    }
                    session.replaceDialog('/end', session.conversationData);
                } else {
                    session.replaceDialog(redirect, session.conversationData);
                }
            }
            else {
                session.send("抱歉，韓非目前沒有服務!");
                session.replaceDialog('/end', session.conversationData);
            }
        });
    }
});

function createHeroCard(session, dialog) {
    var herocardbuttons = [];
    for (var index = 0; index < dialog.attachments[0].content.buttons.length; index++) {
        if (dialog.attachments[0].content.buttons[index].type == "postback") {
            herocardbuttons.push(builder.CardAction.postBack(session, dialog.attachments[0].content.buttons[index].value, dialog.attachments[0].content.buttons[index].title));
        }
        else if (dialog.attachments[0].content.buttons[index].type == "url") {
            herocardbuttons.push(builder.CardAction.openUrl(session, dialog.attachments[0].content.buttons[index].url + '?conversation_id=' + session.message.address.conversation.id + '&dialog_id=' + session.conversationData.index, dialog.attachments[0].content.buttons[index].title));
        }
    }
    var images = [];
    if (dialog.attachments[0].content.images) {
        for (var index = 0; index < dialog.attachments[0].content.images.length; index++) {
            if (dialog.attachments[0].content.images[index].url != undefined || dialog.attachments[0].content.images[index].url != '') {
                images.push(builder.CardImage.create(session, dialog.attachments[0].content.images[0].url));
            }
        }
    }
    var herocard = new builder.HeroCard(session)
        .title(dialog.attachments[0].content.title)
        .subtitle(dialog.attachments[0].content.subtitle)
        .images(images)
        .buttons(herocardbuttons);
    return herocard;
}

function redirect_dialog(session, dialog) {
    var result;
    switch (session.conversationData.index.toString()) {
        case '-2':
            /*preventDialog.delete(session.userData.userId);
            preventMessage.delete(session.userData.userId);
            preventAddress.delete(session.userData.userId);*/
            result = 'endDialog';
            break;
        case '-3':
            result = '/transfer';
            break;
        case '-4':
            logger.info('-----------stay for result------------');
            result = '/stay';
            break;
        case '-5':
            session.userData.flow_id.pop();
            session.userData.pre_flow_id = session.userData.flow_id[session.userData.flow_id.length - 1];
            if (session.userData.flow_id.length <= 0) {
                /*preventDialog.delete(session.userData.userId);
                preventMessage.delete(session.userData.userId);
                preventAddress.delete(session.userData.userId);*/
                result = 'endDialog';
            } else {
                session.conversationData.index = 0;
                preventDialog.set(session.userData.userId, JSON.stringify(global.dialogs[session.userData.pre_flow_id]));
                result = '/flow';
            }
            break;
        case '-6':
            session.userData.flow_id.push(dialog.flow_id);
            preventDialog.set(session.userData.userId, JSON.stringify(global.dialogs[dialog.flow_id]));
            session.conversationData.index = 0;
            result = '/flow';
            break;
        default:
            result = '/flow';
            break;
    }
    return result;
}

function get_picture(url, message, attachment, callback) {
    var https = require('https');
    var URL = require('url');
    var image_url = URL.parse(url);

    if (checkRequiresToken(message)) {
        var options;
        connector.getAccessToken(function (err, accessToken) {
            if (err) throw err;
            else {
                options = {
                    hostname: image_url.hostname,
                    port: image_url.port,
                    path: image_url.path,
                    headers: {
                        'Authorization': 'Bearer <' + accessToken + '>',
                        'Content-Type': 'application/octet-stream'
                    },
                    method: 'GET'
                };

                var req = https.request(options, function (res) {
                    logger.info('STATUS: ' + res.statusCode);
                    logger.info('HEADERS: ' + JSON.stringify(res.headers));
                    res.setEncoding('base64');
                    res.body = '';
                    res.on('data', function (chunk) {
                        logger.info('Image_BODY: ' + chunk);
                        res.body = res.body + chunk;
                    });
                    res.on('end', function () {
                        logger.info('REQUEST END');
                        try {
                            var decodeImg = new Buffer(res.body.toString(), 'base64');
                            this.callback(decodeImg);
                            /* var reply = new builder.Message(this.session)
                                .text('Attachment of %s type and size of %s bytes received.', this.attachment.contentType, decodeImg.length);
                            this.session.send(reply); */
                        } catch (e) {
                            logger.info(e);
                        }
                    }.bind({ /*session: this.session,*/ attachment: this.attachment, callback: this.callback }));
                }.bind({ /*session: session,*/ attachment: attachment, callback: callback }));
                req.on('error', function (e) {
                    logger.info("Get_Image_Error: " + e);
                });
                req.end();
            }
        });
    }
    else {
        var options = {
            hostname: image_url.hostname,
            port: image_url.port,
            path: image_url.path,
            headers: {},
            method: 'GET'
        };

        var req = https.request(options, function (res) {
            logger.info('STATUS: ' + res.statusCode);
            logger.info('HEADERS: ' + JSON.stringify(res.headers));
            res.setEncoding('base64');
            res.body = '';
            res.on('data', function (chunk) {
                logger.info('Image_BODY: ' + chunk);
                res.body = res.body + chunk;
            });
            res.on('end', function () {
                logger.info('REQUEST END');
                try {
                    var decodeImg = new Buffer(res.body.toString(), 'base64');
                    callback(decodeImg);
                    /*var reply = new builder.Message(this.session)
                        .text('Attachment of %s type and size of %s bytes received.', this.attachment.contentType, decodeImg.length);
                    this.session.send(reply);*/
                } catch (e) {
                    logger.info(e);
                }
            }.bind({ /*session: this.session,*/ attachment: this.attachment, callback: this.callback }));
        }.bind({ /*session: session,*/ attachment: attachment, callback: callback }));
        req.on('error', function (e) {
            logger.info("Get_Image_Error: " + e);
        });
        req.end();
    }
}

function getAPIResult(result, session) {
    try {
        result = JSON.parse(result);
    } catch (e) {
        logger.info("API result is not JSON type.");
        return false;
    }
    if (result["type"] != undefined && result["content"] != undefined) {
        switch (result["type"]) {
            case "text":
                var result_replace = result["content"]["text"].replaceAll('<br>', '\n');
                return result_replace;
                break;
            case "image":
                var msg = new builder.Message(session)
                    .addAttachment({
                    content: result["content"]["description"],
                    contentUrl: result["content"]["previewImageUrl"],
                    contentType: 'image/png',
                });
                return msg;
                break;
            case "page":
                var card = new builder.HeroCard(session)
                    .text('請問您要前往' + result["content"]["title"] + "嗎?")
                    .buttons([
                    builder.CardAction.openUrl(session, result["content"]["url"], result["content"]["title"]),
                ]);
                var page_msg = new builder.Message(session).addAttachment(card);
                return page_msg;
                break;
            case "webapi":
                var http;
                if (result["content"]["protocol"] == 'http') {
                    http = require('http');
                } else {
                    http = require('https');
                }
                var path = result["content"]["path"];
                path = encodeURI(path);
                var options = {
                    host: result["content"]["host"],
                    port: result["content"]["port"],
                    path: '/' + path,
                    headers: {},
                    method: result["content"]["method"].toUpperCase()
                };
                if (result["content"]["method"] == 'post' || result["content"]["method"] == 'put') {
                    for (var idx = 0; idx < result["content"].headers.length; idx++) {
                        var header = result["content"].headers[idx].value;
                        header = ReplaceVariable(header, session.conversationData);
                        options.headers[result["content"].headers[idx].name] = header;
                    }
                    var body = result["content"].body;
                    body = ReplaceVariable(body, session.conversationData);
                    options.headers['Content-Length'] = new Buffer(body).length;
                }
                var req = http.request(options, function (res) {
                    logger.info('STATUS: ' + res.statusCode);
                    logger.info('HEADERS: ' + JSON.stringify(res.headers));
                    res.setEncoding('utf8');
                    res.body = '';
                    res.on('data', function (chunk) {
                        logger.info('BODY: ' + chunk);
                        res.body = res.body + chunk;
                    });
                    res.on('end', function () {
                        logger.info('REQUEST END');
                        var end_webapi = res.body;
                        session.send(end_webapi);
                    }.bind({ session: this.session }));
                }.bind({ session: session }));
                req.on('error', function (e) {
                    logger.error(e);
                }.bind({ session: session }));
                if (result["content"]["method"] == 'post' || result["content"]["method"] == 'put') {
                    req.write(body);
                }
                req.end();
                break;
            case "flow":
                session.userData.flow_id.push(result["content"]["flowID"]);
                preventDialog.set(session.userData.userId, JSON.stringify(global.dialogs[result["content"]["flowID"]]));
                session.conversationData.index = 0;
                session.replaceDialog('/flow', session.conversationData);
                return 'flow';
                break;
            case "choice":
                var herocardbuttons = [];
                for (var index = 0; index < result.content.buttons.length; index++) {
                    herocardbuttons.push(builder.CardAction.openUrl(session, result.content.buttons[index].url, result.content.buttons[index].button_text));
                }
                var herocard = new builder.HeroCard(session)
                    .title('產品諮詢結果')
                    .subtitle(result["content"]["description"])
                    .images([
                    builder.CardImage.create(session, result["content"]["previewImageUrl"])
                ])
                    .buttons(herocardbuttons);
                var file_msg = new builder.Message(session).addAttachment(herocard);
                return file_msg;
                break;
            case "undefine":
                return result["content"]["text"];
                logger.error("From QnA Maker User :" + session.userData.userId + " asked this question: " + result["content"]["question"] + " is undefined");
                break;
            case "mult":
                var multbuttons = [];
                for (var index = 0; index < result.content.length; index++) {
                    multbuttons.push(builder.CardAction.postBack(session, result.content[index].value, result.content[index].text));
                }
                var mult = new builder.HeroCard(session)
                    .text(result["title"])
                    .buttons(multbuttons);
                var mult_msg = new builder.Message(session).addAttachment(mult);
                return mult_msg;
                break;
            default:
                logger.info("API result's attribute 'type' is not defined or API result is not our JSON type");
                return "請您稍後再嘗試";
                break;
        }
    } else {
        logger.info("API result is not our JSON type.");
        return false;
    }
}

function post_Hanfei(content, session, userDialog, callback) {
    var http;
    http = require(config.hanfei_bak.protocol);
    var path = config.hanfei_bak.path;
    path = encodeURI(path);
    var options = {
        host: config.hanfei_bak.host,
        port: config.hanfei_bak.port,
        path: '/' + path,
        headers: { "Content-Type": "application/json" },
        method: 'post'
    };
    var data = {
        "question": content
    }
    var reward = {
        "reward_ID": "",
        "ask_time": "",
        "ans_time": "",
        "user_ID": "",
        "questions": "",
        "answers": ""
    }
    reward.ask_time = new Date();
    reward.questions = content;
    reward.user_ID = session.userData.userId;

    var body = JSON.stringify(data);
    options.headers['Content-Length'] = new Buffer(body).length;
    var req = http.request(options, function (res) {
        logger.info('STATUS: ' + res.statusCode);
        logger.info('HEADERS: ' + JSON.stringify(res.headers));
        res.setEncoding('utf8');
        res.body = '';
        res.on('data', function (chunk) {
            logger.info('BODY: ' + chunk);
            res.body = res.body + chunk;
        });
        res.on('end', function () {
            logger.info('REQUEST END');
            try {
                var reward_data = JSON.parse(res.body);
                this.reward.ans_time = new Date();
                this.reward.answers = res.body;
                this.reward.reward_ID = reward_data.reward_ID;
                require('fs').appendFile(__dirname + '/logs/HanFei.json', JSON.stringify(this.reward) + '\n', function (err) {
                    if (err) logger.error('Flow Bot reward HanFei write Log error: ' + err);
                    else logger.info('Flow Bot reward HanFei write Log success');
                });

                var result = res.body;
                var msg = getAPIResult(result, session);
                if (msg && msg != 'flow') {
                    session.send(msg);
                    callback(true);
                }
                else if (msg == 'flow') {
                    return;
                    callback(false);
                }
                /**
                 * 在此放讀json格式的function
                 */
                else {
                    this.session.conversationData.form[this.userDialog[this.session.conversationData.index].field] = result;
                }
            } catch (e) {
                logger.error(e);
                this.session.conversationData.form[this.userDialog[this.session.conversationData.index].field] = e.message;
            }
        }.bind({ session: this.session, userDialog: this.userDialog, reward: this.reward }));
    }.bind({ session: session, userDialog: userDialog, reward: reward }));
    req.on('error', function (e) {
        logger.error(e);
        this.session.conversationData.form[this.userDialog[this.session.conversationData.index].field] = e.message;
    }.bind({ session: session, userDialog: userDialog }));
    req.write(body);
    req.end();
}

var listener = server.listen(process.env.port || process.env.PORT || config.port, function () {
    logger.info('Server listening to ' + listener.address().port);
});

setInterval(function () {
    for (var idx = 0; idx < snapins.getKeys().length; idx++) {
        var snapin_name = snapins.getKeys()[idx];
        var snapin = snapins.get(snapin_name);
        if (snapin.ping_timestamp != undefined) {
            if (snapin.ping_timestamp == 'disconnected') {
                continue;
            }
            // 超過 1 分鐘未回覆 PONG，主動斷線
            if ((new Date().getTime() - snapin.ping_timestamp.getTime()) > (60 * 1000)) {
                logger.info('發現沒有回應的 snapin: ' + snapin_name);
                try {
                    snapin.disconnect();
                    snapin.ping_timestamp = 'disconnected';
                    try {
                        snapins.remove(snapin_name);
                    } catch (e) { }
                } catch (e) {
                    logger.error(e);
                }
                continue;
            }
        }
        logger.debug('傳送 PING 給 Snapin[' + snapin.snapin_name + '][' + snapin.channelId + ']');
        snapin.emit('ping');
        if (snapin.ping_timestamp == undefined) {
            snapin.ping_timestamp = new Date();
        }
    }

    for (var idx = 0; idx < sessions.getKeys().length; idx++) {
        var session = sessions.get(sessions.getKeys()[idx]);
        var userConversationMessage = preventMessage.get(session.userData.userId);
        if (session.userData._updateTime != undefined) {
            if ((new Date().getTime() - session.userData._updateTime.getTime()) > 10 * 60 * 1000) {
                if (session.userData.status == 'register') {
                    session.endConversation('很抱歉，目前客服人員都在忙線中，為了節省您寶貴的時間，請稍後再來訪，謝謝');
                    userConversationMessage.push({ type: 'message', acct: 'flowbot', message: '很抱歉，目前客服人員都在忙線中，為了節省您寶貴的時間，請稍後再來訪，謝謝' });
                    preventMessage.set(session.userData.userId, userConversationMessage);
                } else if (session.userData.status == 'start_service') {
                    session.endConversation('很抱歉，目前客服人員都在忙線中，為了節省您寶貴的時間，請稍後再來訪，謝謝');
                    userConversationMessage.push({ type: 'message', acct: 'flowbot', message: '很抱歉，目前客服人員都在忙線中，為了節省您寶貴的時間，請稍後再來訪，謝謝' });
                    preventMessage.set(session.userData.userId, userConversationMessage);
                } else if (session.userData.status == 'ringing') {
                    session.endConversation('很抱歉，目前客服人員都在忙線中，為了節省您寶貴的時間，請稍後再來訪，謝謝');
                    userConversationMessage.push({ type: 'message', acct: 'flowbot', message: '很抱歉，目前客服人員都在忙線中，為了節省您寶貴的時間，請稍後再來訪，謝謝' });
                    preventMessage.set(session.userData.userId, userConversationMessage);
                } else if (session.userData.status == 'answer') {
                    session.endConversation('很抱歉，因遲遲沒有得到您的回應，本次通話已自動斷線');
                    userConversationMessage.push({ type: 'message', acct: 'flowbot', message: '很抱歉，因遲遲沒有得到您的回應，本次通話已自動斷線' });
                    preventMessage.set(session.userData.userId, userConversationMessage);
                } else {
                    session.endConversation(config.endconversation.prompt);
                    userConversationMessage.push({ type: 'message', acct: 'flowbot', message: '很抱歉，因遲遲沒有得到您的回應，本次通話已自動斷線' });
                    preventMessage.set(session.userData.userId, userConversationMessage);
                }
                if (session.message.address.channelId == 'directline') {
                    session.send('{ "action": "end_service" }');
                }
                if (session.userData.status != undefined) {
                    var token = token_snapin.get(session.userData.snapin_name);
                    var queue = snapin_queue.get(session.userData.snapin_name);
                    if (queue != undefined) {
                        queue.push({ type: 'end_service', acct: session.userData.userId });
                    }
                }
                session.userData.status = undefined;
                session.userData._updateTime = undefined;
                preventDialog.delete(session.userData.userId);
                preventMessage.delete(session.userData.userId);
                sessions.remove(sessions.getKeys()[idx]);
            }
        }
    }
}, 10000);

process.on('uncaughtException', function (err) {
    logger.error('uncaughtException occurred: ' + (err.stack ? err.stack : err));
});
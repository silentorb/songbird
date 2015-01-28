var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};

var Vineyard = require('vineyard');

var Songbird = (function (_super) {
    __extends(Songbird, _super);
    function Songbird() {
        _super.apply(this, arguments);
        this.fallback_bulbs = [];
    }
    Songbird.prototype.till_ground = function (ground_config) {
        this.vineyard.add_schema("node_modules/vineyard-songbird/songbird.json");
    };

    Songbird.prototype.grow = function () {
        var _this = this;
        this.lawn = this.vineyard.bulbs.lawn;
        this.listen(this.lawn, 'socket.add', function (socket, user) {
            return _this.initialize_socket(socket, user);
        });
        if (this.config.template_file) {
            var fs = require('fs');
            var json = fs.readFileSync(this.config.template_file, 'ascii');
            this.templates = JSON.parse(json);
        }
    };

    Songbird.prototype.initialize_socket = function (socket, user) {
        var _this = this;
        this.lawn.on_socket(socket, 'notification/received', user, function (request) {
            return _this.notification_receieved(user, request);
        });

        this.lawn.on_socket(socket, 'notification/received', user, function (request) {
            return _this.send_pending_notifications(user);
        });
    };

    Songbird.prototype.add_fallback = function (fallback) {
        this.fallback_bulbs.push(fallback);
    };

    Songbird.prototype.format_message = function (name, data) {
        if (!this.templates)
            return name;

        if (!this.templates[name])
            throw new Error("Could not find a message template for " + name + ".");

        return this.templates[name].join("");
    };

    Songbird.prototype.notify = function (user_id, name, data, trellis_name, message) {
        var _this = this;
        if (typeof message === "undefined") { message = null; }
        var ground = this.lawn.ground;
        data.event = name;
        data.recipient = user_id;
        return ground.create_update(trellis_name, data, this.lawn.config.admin).run().then(function (notification) {
            console.log('sending-message', name, user_id, data);

            var online = _this.lawn.user_is_online(user_id);
            console.log('notify', {
                notification: notification.id,
                recipient: user_id,
                received: online
            });
            return ground.create_update('notification_target', {
                notification: notification.id,
                recipient: user_id,
                received: online
            }, _this.lawn.config.admin).run().then(function () {
                return _this.push_notification(user_id, data, message);
            });
        });
    };

    Songbird.prototype.notify_without_storing = function (user_id, name, data, message) {
        if (typeof message === "undefined") { message = null; }
        if (!this.lawn.io)
            return when.resolve();

        return this.push_notification(user_id, data, message);
    };

    Songbird.prototype.push_notification = function (user_id, data, message) {
        var _this = this;
        var sql = "SELECT users.id, COUNT(targets.id) AS badge FROM users" + "\nJOIN notification_targets targets" + "\nON targets.recipient = users.id AND targets.viewed = 0" + "\nWHERE users.id = ?";

        data.push_message = message;

        return this.ground.db.query_single(sql, [user_id]).then(function (row) {
            _this.lawn.io.sockets.in('user/' + user_id).emit(data.event, data);
            if (_this.lawn.user_is_online(user_id))
                return when.resolve();

            return when.all(_this.fallback_bulbs.map(function (b) {
                return b.send({ id: user_id }, message, data, row.badge);
            }));
        });
    };

    Songbird.prototype.notification_receieved = function (user, request) {
        var ground = this.lawn.ground;
        var query = ground.create_query('notification_target');
        query.add_filter('recipient', user);
        query.add_filter('notification', request.notification);
        return query.run_single(user).then(function (object) {
            if (!object)
                throw new HttpError('Could not find a notification with that id and target user.', 400);

            if (object.received)
                throw new HttpError('That notification was already marked as received.', 400);

            return ground.update_object('notification_target', {
                id: object.id,
                received: true
            }).then(function (object) {
                return { message: "Notification is now marked as received." };
            });
        });
    };

    Songbird.prototype.send_pending_notifications = function (user) {
        var _this = this;
        var ground = this.lawn.ground;
        var query = ground.create_query('notification_target');
        query.add_filter('recipient', user);
        query.add_filter('received', false);
        query.run(user).done(function (objects) {
            for (var i = 0; i < objects.length; ++i) {
                var notification = objects[i].notification;
                _this.lawn.io.sockets.in('user/' + user.id).emit(notification.event, notification.data);
            }
        });
    };
    return Songbird;
})(Vineyard.Bulb);

module.exports = Songbird;
//# sourceMappingURL=songbird.js.map

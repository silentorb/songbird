var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};

var Songbird = (function (_super) {
    __extends(Songbird, _super);
    function Songbird() {
        _super.apply(this, arguments);
        this.fallback_bulbs = [];
    }
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

    Songbird.prototype.notify = function (users, name, data, trellis_name, store) {
        var _this = this;
        if (typeof store === "undefined") { store = true; }
        var ground = this.lawn.ground;
        var ids = users.map(function (x) {
            return typeof x == 'object' ? x.id : x;
        });
        var message;

        if (!store || !trellis_name) {
            if (!this.lawn.io)
                return when.resolve();

            return this.push_notification(ids, data);
        }

        data.event = name;
        return ground.create_update(trellis_name, data, this.lawn.config.admin).run().then(function (notification) {
            return when.all(ids.map(function (id) {
                console.log('sending-message', name, id, data);

                var online = _this.lawn.user_is_online(id);

                return ground.create_update('notification_target', {
                    notification: notification.id,
                    recipient: id,
                    received: online
                }, _this.lawn.config.admin).run();
            })).then(function () {
                return _this.push_notification(ids, data);
            });
        });
    };

    Songbird.prototype.push_notification = function (ids, data) {
        var _this = this;
        ids = ids.filter(function (id) {
            return typeof id == 'number';
        });
        var sql = "SELECT users.id, COUNT(targets.id) AS badge FROM users" + "\nJOIN notification_targets targets" + "\nON targets.user = users.id AND targets.viewed = 0" + "\nWHERE id IN (" + ids.join(', ') + " )";

        return this.ground.db.query(sql).then(function (users) {
            return users.map(function (user) {
                _this.lawn.io.sockets.in('user/' + user.id).emit(name, data);
                if (_this.lawn.user_is_online(user.id))
                    return when.resolve();

                var message = _this.format_message(name, data);
                return when.all(_this.fallback_bulbs.map(function (b) {
                    return b.send({ id: user.id }, message, data, user.badge);
                }));
            });
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

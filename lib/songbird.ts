/// <reference path="../../vineyard/vineyard.d.ts"/>
/// <reference path="../../vineyard-lawn/lawn.d.ts"/>

interface Songbird_Method {
	send:(user, message:string, data, badge)=> Promise
}

class Songbird extends Vineyard.Bulb {
	lawn:Lawn
	fallback_bulbs:Songbird_Method[] = []
	templates

	grow() {
		this.lawn = this.vineyard.bulbs.lawn
		this.listen(this.lawn, 'socket.add', (socket, user)=> this.initialize_socket(socket, user))
		if (this.config.template_file) {
			var fs = require('fs')
			var json = fs.readFileSync(this.config.template_file, 'ascii')
			this.templates = JSON.parse(json)
		}
	}

	initialize_socket(socket, user) {
		this.lawn.on_socket(socket, 'notification/received', user, (request)=>
				this.notification_receieved(user, request)
		)

		this.lawn.on_socket(socket, 'notification/received', user, (request)=>
				this.send_pending_notifications(user)
		)
	}

	public add_fallback(fallback) {
		this.fallback_bulbs.push(fallback)
	}

	format_message(name, data):string {
		if (!this.templates)
			return name

		if (!this.templates[name])
			throw new Error("Could not find a message template for " + name + ".")

		return this.templates[name].join("")
	}

	notify(user, name, data, trellis_name:string, store = true):Promise {
		var ground = this.lawn.ground
		var message

		if (!store || !trellis_name) {
			if (!this.lawn.io)
				return when.resolve()

			return this.push_notification(user.id, data)
		}

		data.event = name
		return ground.create_update(trellis_name, data, this.lawn.config.admin).run()
			.then((notification)=> {
				console.log('sending-message', name, user.id, data)

				var online = this.lawn.user_is_online(user.id)

				return ground.create_update('notification_target', {
					notification: notification.id,
					recipient: user.id,
					received: online
				}, this.lawn.config.admin).run()
					.then(()=> this.push_notification(user.id, data))
			})
	}

	private push_notification(ids, data) {
		ids = ids.filter((id)=> typeof id == 'number')
		var sql = "SELECT users.id, COUNT(targets.id) AS badge FROM users"
			+ "\nJOIN notification_targets targets"
			+ "\nON targets.user = users.id AND targets.viewed = 0"
			+ "\nWHERE id IN (" + ids.join(', ') + " )"

		return this.ground.db.query(sql)
			.then((users)=> users.map((user)=> {
				this.lawn.io.sockets.in('user/' + user.id).emit(name, data)
				if (this.lawn.user_is_online(user.id))
					return when.resolve()

				var message = this.format_message(name, data)
				return when.all(this.fallback_bulbs.map((b)=> b.send({id: user.id}, message, data, user.badge)))
			})
		)
	}

	notification_receieved(user, request):Promise {
		var ground = this.lawn.ground
		var query = ground.create_query('notification_target')
		query.add_filter('recipient', user)
		query.add_filter('notification', request.notification)
		return query.run_single(user)
			.then((object)=> {
				if (!object)
					throw new HttpError('Could not find a notification with that id and target user.', 400)

				if (object.received)
					throw new HttpError('That notification was already marked as received.', 400)

				return ground.update_object('notification_target', {
					id: object.id,
					received: true
				})
					.then((object)=> {
						return {message: "Notification is now marked as received."}
					})
			})
	}

	send_pending_notifications(user) {
		var ground = this.lawn.ground
		var query = ground.create_query('notification_target')
		query.add_filter('recipient', user)
		query.add_filter('received', false)
		query.run(user)
			.done((objects)=> {
				for (var i = 0; i < objects.length; ++i) {
					var notification = objects[i].notification
					this.lawn.io.sockets.in('user/' + user.id).emit(notification.event, notification.data)
				}
			})
	}
}

module.exports = Songbird
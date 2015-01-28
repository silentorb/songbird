/// <reference path="../vineyard/vineyard.d.ts"/>
/// <reference path="../vineyard-lawn/lawn.d.ts"/>

interface Songbird_Method {
	send:(user, message:string, data, badge)=> Promise
}

import Vineyard = require('vineyard')

class Songbird extends Vineyard.Bulb {
	lawn:Lawn
	fallback_bulbs:Songbird_Method[] = []
	templates

	till_ground(ground_config:Vineyard.Ground_Configuration) {
		this.vineyard.add_schema("node_modules/vineyard-songbird/songbird.json")
	}

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

	notify(user_id:number, name:string, data, trellis_name:string, message:string = null):Promise {
		// Temporary backwards compatibility
		var ground = this.lawn.ground
		data.event = name
		data.recipient = user_id
		return ground.create_update(trellis_name, data, this.lawn.config.admin).run()
			.then((notification)=> {
				console.log('sending-message', name, user_id, data)

				var online = this.lawn.user_is_online(user_id)
				console.log('notify', {
					notification: notification.id,
					recipient: user_id,
					received: online
				})
				return ground.create_update('notification_target', {
					notification: notification.id,
					recipient: user_id,
					received: online
				}, this.lawn.config.admin).run()
					.then(()=> this.push_notification(user_id, data, message))
			})
	}

	notify_without_storing(user_id:number, name:string, data, message:string = null):Promise {
		if (!this.lawn.io)
			return when.resolve()

		return this.push_notification(user_id, data, message)
	}

	private push_notification(user_id:number, data, message:string) {
		var sql = "SELECT users.id, COUNT(targets.id) AS badge FROM users"
			+ "\nJOIN notification_targets targets"
			+ "\nON targets.recipient = users.id AND targets.viewed = 0"
			+ "\nWHERE users.id = ?"

		data.push_message = message

		return this.ground.db.query_single(sql, [user_id])
			.then((row)=> {
				this.lawn.io.sockets.in('user/' + user_id).emit(data.event, data)
				if (this.lawn.user_is_online(user_id))
					return when.resolve()

				return when.all(this.fallback_bulbs.map((b)=> b.send({id: user_id}, message, data, row.badge)))
			}
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
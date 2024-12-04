var { API, Service, Characteristic } = require('./homebridge.js');
var Events = require('events');
var Timer = require('yow/timer');

module.exports = class extends Events {
	constructor(options) {
		super();

		let { device, platform } = options;
		let uuid = device.id;

		this.name = device.name;

		// Apparently we need a display name...
		this.displayName = device.name;

		// Seems like we have to set the uuid_base member to a unique ID to have several platforms with accessories with the same name
		this.uuid_base = uuid;

		// What do I know, but this is set also...
		this.UUID = uuid;
		this.uuid = uuid;

		this.platform = platform;
		this.device = device;
		this.log = platform.log;
		this.debug = platform.debug;
		this.services = [];

		this.addService(new Service.AccessoryInformation());
		this.updateCharacteristicValue(Service.AccessoryInformation, Characteristic.FirmwareRevision, '1.0');
		this.updateCharacteristicValue(Service.AccessoryInformation, Characteristic.Model, this.device.driverId);
		this.updateCharacteristicValue(Service.AccessoryInformation, Characteristic.Manufacturer, this.device.driverUri);
		this.updateCharacteristicValue(Service.AccessoryInformation, Characteristic.SerialNumber, this.device.id);

		try {
			this.updateCharacteristicValue(Service.AccessoryInformation, Characteristic.Manufacturer, this.device.settings['zb_manufacturer_name']);
			this.updateCharacteristicValue(Service.AccessoryInformation, Characteristic.Model, this.device.settings['zb_product_id']);
		} catch (error) {}
	}

	addService(service) {
		this.services.push(service);
	}

	getServices() {
		return this.services;
	}

	getService(name) {
		if (name instanceof Service) return name;

		for (var index in this.services) {
			var service = this.services[index];

			if (typeof name === 'string' && (service.displayName === name || service.name === name)) return service;
			else if (typeof name === 'function' && (service instanceof name || name.UUID === service.UUID)) return service;
		}
	}

	async publish(capabilityID, value) {
		this.debug(`Publishing ${this.platform.config.mqtt.topic}/devices/${this.device.id}/${capabilityID}:${value}`);
		await this.platform.mqtt.publish(`${this.platform.config.mqtt.topic}/devices/${this.device.id}/${capabilityID}`, JSON.stringify(value));
	}

	updateCharacteristicValue(service, characteristic, value) {
		this.getService(service).getCharacteristic(characteristic).updateValue(value);
	}

	enableCharacteristic(service, characteristic, getter, setter) {
		service = this.getService(service);

		if (typeof getter === 'function') {
			service.getCharacteristic(characteristic).on('get', async (callback) => {
				try {
					var value = await getter();
					callback(null, value);
				} catch (error) {
					this.log(error);
					callback();
				}
			});
		}

		if (typeof setter === 'function') {
			service.getCharacteristic(characteristic).on('set', async (value, callback) => {
				try {
					await setter(value);
				} catch (error) {
					this.log(error);
				} finally {
					callback();
				}
			});
		}
	}

	evaluate(code, args = {}) {
		// Call is used to define where "this" within the evaluated code should reference.
		// eval does not accept the likes of eval.call(...) or eval.apply(...) and cannot
		// be an arrow function
		return function () {
			// Create an args definition list e.g. "arg1 = this.arg1, arg2 = this.arg2"
			const argsStr = Object.keys(args)
				.map((key) => `${key} = this.${key}`)
				.join(',');
			const argsDef = argsStr ? `let ${argsStr};` : '';

			return eval(`${argsDef}${code}`);
		}.call(args);
	}

	enableOnOff(service) {
		let capabilityID = 'onoff';
		let capability = this.device.capabilitiesObj[capabilityID];

		if (capability == undefined) return;

		let characteristic = this.getService(service).getCharacteristic(Characteristic.On);
		let deviceCapabilityID = `${this.device.id}/${capability.id}`;
		let onoff = capability.value ? true : false;

		characteristic.updateValue(onoff);

		if (capability.getable) {
			characteristic.on('get', (callback) => {
				callback(null, onoff);
			});
		}

		if (capability.setable) {
			characteristic.on('set', async (value, callback) => {
				this.debug(`Setting device ${this.name}/${capabilityID} to ${value} (${deviceCapabilityID}).`);
				await this.publish(capabilityID, value);
				onoff = value;
				callback();
			});
		}

		this.on(capabilityID, (value) => {
			onoff = value;
			this.debug(`Updating ${deviceCapabilityID}:${value} (${this.name})`);

			characteristic.updateValue(onoff);
		});
	}

	enableLock(service) {
		service = this.getService(service);

		var UNSECURED = Characteristic.LockCurrentState.UNSECURED;
		var SECURED = Characteristic.LockCurrentState.SECURED;
		var JAMMED = Characteristic.LockCurrentState.JAMMED;
		var UNKNOWN = Characteristic.LockCurrentState.UNKNOWN;

		let capabilityID = 'locked';
		let capability = this.device.capabilitiesObj[capabilityID];

		if (capability == undefined) {
			return;
		}

		let deviceCapabilityID = `${this.device.id}/${capability.id}`;
		let locked = capability.value ? true : false;

		let getLockState = () => {
			return locked ? SECURED : UNSECURED;
		};

		let setLockState = async (value) => {
			this.debug(`SETTINGS LOCK VALUE!`);
			let convertedValue = value == SECURED;

			this.debug(`Setting device ${this.name}/${capabilityID} to ${convertedValue} (${deviceCapabilityID}).`);
			await this.publish(capabilityID, convertedValue);
		};

		this.enableCharacteristic(service, Characteristic.LockCurrentState, getLockState);
		this.enableCharacteristic(service, Characteristic.LockTargetState, getLockState, setLockState);

		this.debug(`ENABELING LOCK!!!!!!!!!!!!!!!!!!`);

        this.updateCharacteristicValue(service, Characteristic.LockCurrentState, locked ? SECURED : UNSECURED);

		this.on(capabilityID, (value) => {
			this.debug(`UPDATING LOCK VALUE!`);
			locked = value;
			this.debug(`Updating ${deviceCapabilityID}:${locked} (${this.name})`);

			//service.getCharacteristic(Characteristic.LockCurrentState).updateValue(locked ? SECURED : UNSECURED);
			//service.getCharacteristic(Characteristic.LockTargetState).updateValue(locked ? SECURED : UNSECURED);

			this.updateCharacteristicValue(service, Characteristic.LockCurrentState, locked ? SECURED : UNSECURED);
			this.updateCharacteristicValue(service, Characteristic.LockTargetState, locked ? SECURED : UNSECURED);
		});
	}

	updateValue(characteristic, value) {
		characteristic.updateValue(value);
	}

	updateCharacteristicValue(service, characteristic, value) {
		service.getCharacteristic(characteristic).updateValue(value);
	}

	enableLightSensor(service) {
		let capabilityID = 'measure_luminance';
		let capability = this.device.capabilitiesObj[capabilityID];

		if (capability == undefined) return;

		let characteristic = this.getService(service).getCharacteristic(Characteristic.CurrentAmbientLightLevel);
		let deviceCapabilityID = `${this.device.id}/${capability.id}`;
		let currentAmbientLightLevel = capability.value;

		characteristic.updateValue(currentAmbientLightLevel);

		if (capability.getable) {
			characteristic.on('get', (callback) => {
				callback(null, currentAmbientLightLevel);
			});
		}

		this.on(capabilityID, (value) => {
			this.debug(`Updating "${this.name}" ${capabilityID} to ${value} (${this.device.id}).`);

			characteristic.updateValue((currentAmbientLightLevel = value));
		});
	}

	enableBrightness(service) {
		let capabilityID = 'dim';
		let capability = this.device.capabilitiesObj[capabilityID];

		if (capability == undefined) return;

		let characteristic = this.getService(service).getCharacteristic(Characteristic.Brightness);
		let deviceCapabilityID = `${this.device.id}/${capability.id}`;

		let value = capability.value;
		value = (value - capability.min) / (capability.max - capability.min);
		value = value * (characteristic.props.maxValue - characteristic.props.minValue) + characteristic.props.minValue;
		characteristic.updateValue(value);

		let brightness = value;

		if (capability.getable) {
			characteristic.on('get', (callback) => {
				callback(null, brightness);
			});
		}

		if (capability.setable) {
			characteristic.on('set', async (value, callback) => {
				let convertedValue = value;
				convertedValue = (convertedValue - characteristic.props.minValue) / (characteristic.props.maxValue - characteristic.props.minValue);
				convertedValue = convertedValue * (capability.max - capability.min) + capability.min;

				await this.publish(capabilityID, convertedValue);

				brightness = value;
				callback();
			});
		}

		this.on(capabilityID, (value) => {
			// Hmm. Values min/max special case due to on/off
			if (value == capability.min || value == capability.max) return;

			value = (value - capability.min) / (capability.max - capability.min);
			value = value * (characteristic.props.maxValue - characteristic.props.minValue) + characteristic.props.minValue;

			brightness = value;

			this.debug(`Updating "${this.name}" ${capabilityID} to ${value} (${this.device.id}).`);

			characteristic.updateValue(brightness);
		});
	}

	enableColorTemperature(service) {
		let capabilityID = 'light_temperature';
		let capability = this.device.capabilitiesObj[capabilityID];

		if (capability == undefined) return;

		let characteristic = this.getService(service).getCharacteristic(Characteristic.ColorTemperature);
		let deviceCapabilityID = `${this.device.id}/${capability.id}`;
		let colorTemperature = capability.value;

		let value = capability.value;
		value = (value - capability.min) / (capability.max - capability.min);
		value = value * (characteristic.props.maxValue - characteristic.props.minValue) + characteristic.props.minValue;
		characteristic.updateValue(value);

		if (capability.getable) {
			characteristic.on('get', (callback) => {
				let value = colorTemperature;

				value = (value - capability.min) / (capability.max - capability.min);
				value = value * (characteristic.props.maxValue - characteristic.props.minValue) + characteristic.props.minValue;

				callback(null, value);
			});
		}

		if (capability.setable) {
			characteristic.on('set', async (value, callback) => {
				value = (value - characteristic.props.minValue) / (characteristic.props.maxValue - characteristic.props.minValue);
				value = value * (capability.max - capability.min) + capability.min;

				this.publish(capabilityID, value);

				colorTemperature = value;
				callback();
			});
		}

		this.on(capabilityID, (value) => {
			colorTemperature = value;

			value = (value - capability.min) / (capability.max - capability.min);
			value = value * (characteristic.props.maxValue - characteristic.props.minValue) + characteristic.props.minValue;

			this.debug(`Updating "${this.name}" ${capabilityID} to ${value} (${this.device.id}).`);

			characteristic.updateValue(value);
		});
	}

	enableCurrentTemperature(service) {
		let capabilityID = 'measure_temperature';
		let capability = this.device.capabilitiesObj[capabilityID];

		if (capability == undefined) return;

		let characteristic = this.getService(service).getCharacteristic(Characteristic.CurrentTemperature);
		let deviceCapabilityID = `${this.device.id}/${capability.id}`;
		let currentTemperature = capability.value;

		characteristic.updateValue(currentTemperature);

		if (characteristic.getable) {
			characteristic.on('get', (callback) => {
				callback(null, currentTemperature);
			});
		}

		this.on(capabilityID, (value) => {
			currentTemperature = value;

			this.debug(`Updating "${this.name}" ${capabilityID} to ${value} (${this.device.id}).`);
			characteristic.updateValue(currentTemperature);
		});
	}

	enableCurrentRelativeHumidity(service) {
		let capabilityID = 'measure_humidity';
		let capability = this.device.capabilitiesObj[capabilityID];

		if (capability == undefined) return;

		let characteristic = this.getService(service).getCharacteristic(Characteristic.CurrentRelativeHumidity);
		let currentRelativeHumidity = capability.value;

		characteristic.updateValue(currentRelativeHumidity);

		if (characteristic.getable) {
			characteristic.on('get', (callback) => {
				callback(null, currentRelativeHumidity);
			});
		}

		this.on(capabilityID, (value) => {
			currentRelativeHumidity = value;

			this.debug(`Updating "${this.name}" ${capabilityID} to ${value} (${this.device.id}).`);
			characteristic.updateValue(currentRelativeHumidity);
		});
	}

	enableMotionDetected(service) {
		let capabilityID = 'alarm_motion';
		let capability = this.device.capabilitiesObj[capabilityID];

		if (capability == undefined) return;

		let characteristic = this.getService(service).getCharacteristic(Characteristic.MotionDetected);
		let deviceCapabilityID = `${this.device.id}/${capability.id}`;
		let motionDetected = capability.value;

		characteristic.updateValue(motionDetected);

		if (capability.getable) {
			characteristic.on('get', (callback) => {
				callback(null, motionDetected);
			});
		}

		if (capability.setable) {
			characteristic.on('set', async (value, callback) => {
				await this.publish(capabilityID, value);
				motionDetected = value;
				callback();
			});
		}

		this.on(capabilityID, (value) => {
			motionDetected = value;
			//			this.debug(`Updating "${this.name}" ${capabilityID} to ${value} (${this.device.id}).`);
			//			this.debug(`Updating ${deviceCapabilityID}:${value} (${this.name}).`);
			//            this.debug(`Updating "${this.name}" - ${deviceCapabilityID}:${value}`);
			this.debug(`Updating ${deviceCapabilityID}:${value} (${this.name})`);

			characteristic.updateValue(motionDetected);
		});
	}

	enableProgrammableSwitchEvent(service) {
		this.log('-------------------------------');

		let capabilityID = 'alarm_generic';
		let capability = this.device.capabilitiesObj[capabilityID];

		if (capability == undefined) return;

		let characteristic = this.getService(service).getCharacteristic(Characteristic.ProgrammableSwitchEvent);
		let deviceCapabilityID = `${this.device.id}/${capability.id}`;
		let capabilityValue = capability.value;

		characteristic.setProps({ maxValue: 0 });
		this.log(`${capabilityValue}!!!!!!!!`);
		//		characteristic.updateValue(capabilityValue ? 1 : 0);

		this.on(capabilityID, (value) => {
			capabilityValue = value;
			this.debug(`Updating ${this.name} ProgrammableSwitchEvent to ${capabilityValue}.`);
			//			characteristic.updateValue(capabilityValue ? 1 : 0);
		});
	}
};

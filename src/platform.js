"use strict";


module.exports = class Platform {

    constructor(log, config, homebridge) {

		const Mqtt = require("mqtt");
		const MqttAsync = require("mqtt-async");
	
        this.config = config;
        this.log = log;
        this.homebridge = homebridge;
        this.debug = config.debug ? log : () => {};

		this.debug(`Connecting to MQTT broker ${this.config.mqtt.host}...`);

        this.mqtt = MqttAsync(Mqtt.connect(this.config.mqtt.host, {
            username: this.config.mqtt.username,
            password: this.config.mqtt.password,
            port: this.config.mqtt.port
        }));
    

        this.homebridge.on('didFinishLaunching', () => {
            this.debug('Finished launching.');
		});

    }



	createAccessory(device) {

        let Socket =  require('./accessories/socket.js');
        let Light = require('./accessories/light.js');
        let TV = require('./accessories/tv.js');
        let Sensor = require('./accessories/sensor.js');
        let Switch = require('./accessories/switch.js');
        
        let Accessory = undefined;

        switch (device.class) {
            case 'tv': {
                Accessory = TV; 
                break;
            }
            case 'socket': {
                Accessory = Socket;
                break;
            }
            case 'sensor': {
                Accessory = Sensor;
                break;
            }
            case 'light': {
                Accessory = Light;
                break;
            }
            default: {
                if (device.capabilitiesObj && device.capabilitiesObj.onoff) {
                    Accessory = Switch;
                }
                /*
                if (device.capabilitiesObj && device.capabilitiesObj.measure_temperature) {
                    Accessory = Sensor;
                }
                if (device.capabilitiesObj && device.capabilitiesObj.measure_humidity) {
                    Accessory = Sensor;
                }
                */
                
                break;
            }
        }

        
        if (Accessory != undefined) {
            return new Accessory({device:device, platform:this});
        }
	

	}

	createAccessories(devices) {

        let Socket =  require('./accessories/socket.js');
        let Light = require('./accessories/light.js');
        let TV = require('./accessories/tv.js');
        let Sensor = require('./accessories/sensor.js');
        let Switch = require('./accessories/switch.js');
        let Lock = require('./accessories/lock.js');
        
        let accessories = [];

		this.debug(`Creating accessories...`);

		for (let key in devices) {
            let device = devices[key];

			if (this.config.exclude && this.config.exclude.indexOf(device.id) >= 0) {
				this.debug(`Excluding device ${device.zoneName}/${device.name}.`);
				continue;
			}

            if (!device.capabilitiesObj) {
                this.debug(`Ignoring device ${device.zoneName}/${device.name}. No capabilities.`);
                continue;
            }

			let Accessory = undefined;

            switch (device.class) {
                case 'tv': {
                    Accessory = TV; 
                    break;
                }
                case 'socket': {
                    Accessory = Socket;
                    break;
                }
                case 'sensor': {
                    Accessory = Sensor;
                    break;
                }
                case 'light': {
                    Accessory = Light;
                    break;
                }
                case 'lock': {
                    Accessory = Lock;
                    break;
                }
                default: {
                    if (device.capabilitiesObj.onoff) {
                        Accessory = Switch;
                    }
/*
                    if (device.capabilitiesObj.measure_temperature) {
                        Accessory = Sensor;
                    }
                    */
                    break;
                }
            }
			
			if (Accessory != undefined) {
				this.debug(`Adding device ${device.zoneName}/${device.name}.`);
                accessories.push(new Accessory({device:device, platform:this}));
			}
	
		}

		return accessories;

	}


    accessories(callback) {
		

        let accessories = undefined;

		this.mqtt.on('connect', () => {
     
            this.debug(`Subscribing to ${this.config.mqtt.topic}/devices...`);

            this.mqtt.subscribe(`${this.config.mqtt.topic}/devices`);
            this.mqtt.subscribe(`${this.config.mqtt.topic}/devices/+/+`);
    
            this.mqtt.on('message', (topic, message) => {
                let value = JSON.parse(message.toString());
    
                if (topic == `${this.config.mqtt.topic}/devices`) {
                    accessories = this.createAccessories(value);
                    callback(accessories);	
    
                }
                else {
                    let parts = topic.split('/');
                    let capabilityID = parts.pop();
                    let deviceID = parts.pop();

                    let accessory = accessories.find(item => {
                        return item.device.id == deviceID;
                    });

                    if (accessory != undefined)
                        accessory.emit(capabilityID, value);
                }
            });
          


        });




    }

	generateUUID(id) {
        return this.homebridge.hap.uuid.generate(id.toString());
    }

}

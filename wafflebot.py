#!/usr/bin/env python3
# Copyright 2019 Amazon.com, Inc. or its affiliates.  All Rights Reserved.
# 
# You may not use this file except in compliance with the terms and conditions 
# set forth in the accompanying LICENSE.TXT file.
#
# THESE MATERIALS ARE PROVIDED ON AN "AS IS" BASIS. AMAZON SPECIFICALLY DISCLAIMS, WITH 
# RESPECT TO THESE MATERIALS, ALL WARRANTIES, EXPRESS, IMPLIED, OR STATUTORY, INCLUDING 
# THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

import os
import sys
import time
import logging
import json
import random
import threading
from enum import Enum

from agt import AlexaGadget

from ev3dev2.led import Leds
from ev3dev2.sound import Sound
from ev3dev2.motor import OUTPUT_A, OUTPUT_B, OUTPUT_C, OUTPUT_D, SpeedPercent, LargeMotor
from ev3dev2.sensor.lego import ColorSensor

# Set the logging level to INFO to see messages from AlexaGadget
logging.basicConfig(level=logging.INFO, stream=sys.stdout, format='%(message)s')
logging.getLogger().addHandler(logging.StreamHandler(sys.stderr))
logger = logging.getLogger(__name__)

class EventName(Enum):
    """
    The list of custom event name sent from this gadget
    """
    SPEECH = "Speech"

class MindstormsGadget(AlexaGadget):
    """
    A Mindstorms gadget that can perform bi-directional interaction with an Alexa skill.
    """

    def __init__(self):
        """
        Performs Alexa Gadget initialization routines and ev3dev resource allocation.
        """
        super().__init__()

        # Robot state

        # Connect large motors to A,B,C,D.
        self.forkArm = LargeMotor(OUTPUT_B)
        self.lidArm = LargeMotor(OUTPUT_A)
        self.sensorArm = LargeMotor(OUTPUT_C)
        self.dispenser = LargeMotor(OUTPUT_D)
        self.colorSensor = ColorSensor()

        self.leds = Leds()    
        self.sound = Sound()                

        # Start threads

    def on_connected(self, device_addr):
        """
        Gadget connected to the paired Echo device.
        :param device_addr: the address of the device we connected to
        """
        self.leds.set_color("LEFT", "GREEN")
        self.leds.set_color("RIGHT", "GREEN")
        logger.info("{} connected to Echo device".format(self.friendly_name))

        self._resetRobot()

    def on_disconnected(self, device_addr):
        """
        Gadget disconnected from the paired Echo device.
        :param device_addr: the address of the device we disconnected from
        """
        #reset the robot in the event it was in the middle of cooking
        self._resetRobot()

        self.leds.set_color("LEFT", "BLACK")
        self.leds.set_color("RIGHT", "BLACK")
        logger.info("{} disconnected from Echo device".format(self.friendly_name))

    def on_custom_mindstorms_gadget_control(self, directive):
        """
        Handles the Custom.Mindstorms.Gadget control directive.
        :param directive: the custom directive with the matching namespace and name
        """
        try:
            payload = json.loads(directive.payload.decode("utf-8"))
            print("Control payload: {}".format(payload), file=sys.stderr)
            control_type = payload["type"]
            
            if control_type == "makeWaffles":
                # Expected params: [desiredWaffles,cookTimeMinutes,cookTimeSeconds,dispenseTimeSeconds]
                self._makeWaffles(payload["desiredWaffles"],payload["cookTimeMinutes"],payload["cookTimeSeconds"],payload["dispenseTimeSeconds"])

        except KeyError:
            print("Missing expected parameters: {}".format(directive), file=sys.stderr)

    def _makeWaffles(self, desiredWaffles, cookTimeMinutes, cookTimeSeconds, dispenseTimeSeconds):
        """
        Handles makeWaffles commands from the directive.
        :param desiredWaffles: desired number of waffles as an integer.
        """
        print("Make Waffles command: ({},{},{},{})".format(desiredWaffles,cookTimeMinutes,cookTimeSeconds,dispenseTimeSeconds), file=sys.stderr)             

        madeWaffles = 0

        self._closeLid()

        if self._checkHeatLight() == False:
            if self._heatUpWaffleIron() == False:
                self._send_event(EventName.SPEECH, {'speechOut': "Waffle bot encountered a problem heating up the waffle iron. Please check the waffle iron and try your request again."})                
                #can't cook waffles without a hot iron. 
                return False

        self._openLid()

        while madeWaffles < int(desiredWaffles):

            self._dispenseBatter(int(dispenseTimeSeconds))

            self._closeLid()
            
            totalCookTimeSeconds = ((int(cookTimeMinutes) * 60) + int(cookTimeSeconds))        
            print("totalCookTimeSeconds: {}".format(totalCookTimeSeconds), file=sys.stderr)        

            time.sleep(totalCookTimeSeconds)

            self._openLid()

            #attempt two pickup/delivery attempts
            self._pickUpWaffle()
            self._deliverWaffle()
            self._pickUpWaffle()
            self._deliverWaffle()

            if self._checkWaffleIron() == False:
                #attempt two additional pickup/delivery attempts
                self._pickUpWaffle()
                self._deliverWaffle()
                self._pickUpWaffle()
                self._deliverWaffle()       

                if self._checkWaffleIron() == False:
                    #if obstruction is still present, send event back to alexa
                    self._send_event(EventName.SPEECH, {'speechOut': "Waffle bot has detected an obstruction on the cooking surface. Please clear the obstruction and try your request again."})
                    #exit loop
                    break
            
            madeWaffles = madeWaffles + 1
            

    def _openLid(self):

        self.lidArm.on_for_degrees(SpeedPercent(-20),95)   

    def _closeLid(self):

        self.lidArm.on_for_degrees(SpeedPercent(20),95)          

    def _pickUpWaffle(self):
        self.forkArm.on_for_degrees(SpeedPercent(50),1600)    

    def _deliverWaffle(self):
        self.forkArm.on_for_degrees(SpeedPercent(-50),1600)     

    def _dispenseBatter(self,dispenseTimeSeconds):      
        #dispense batter
        self.dispenser.on_for_degrees(SpeedPercent(50),140)
        time.sleep(dispenseTimeSeconds)  
        self.dispenser.on_for_degrees(SpeedPercent(-50),140)
        #give batter time to settle
        time.sleep(3) 

    def _heatUpWaffleIron(self):
        self._send_event(EventName.SPEECH, {'speechOut': "Waffle bot needs to heat up the waffle iron. Your request will continue when the waffle iron is ready."})                

        checkAttempts = 0

        while checkAttempts <= 30:
            time.sleep(10)
            if self._checkHeatLight() == False:
                checkAttempts = checkAttempts + 1
            else:
                self._send_event(EventName.SPEECH, {'speechOut': "The waffle iron is ready. Waffle bot can continue your request."})     
                return True

        return False



    def _checkHeatLight(self):
        #a detected ambient light intensity greater than or equal to 4 indicates the heat light is on

        print("checking heat light")

        self.sensorArm.on_for_degrees(SpeedPercent(20),70)
        
        time.sleep(.5)  
        ambientLightIntensity = self.colorSensor.ambient_light_intensity

        self.sensorArm.on_for_degrees(SpeedPercent(-20),70)

        print("heat light ambient light intensity: {}".format(ambientLightIntensity), file=sys.stderr)

        if ambientLightIntensity >= 4:
            return False
        else:
            return True        

    def _checkWaffleIron(self):
        
        print("checking waffle iron")

        #anything with a reflected light intensity greater than 5 is considered an obstruction
        self.sensorArm.on_for_degrees(SpeedPercent(20),95)
        
        time.sleep(.5)  
        reflectedLightIntensity = self.colorSensor.reflected_light_intensity

        self.sensorArm.on_for_degrees(SpeedPercent(-20),95)        

        print("waffle iron reflected light intensity: {}".format(reflectedLightIntensity), file=sys.stderr)

        if reflectedLightIntensity > 5:
            return False
        else:
            return True

    def _resetRobot(self):
        print("resetting robot")

        self.forkArm.on(SpeedPercent(-20))
        self.forkArm.wait(overloadedOrStalled)
        self.forkArm.reset()
        self.forkArm.on_for_degrees(SpeedPercent(20),90)  

        self.sensorArm.on(SpeedPercent(-20))
        self.sensorArm.wait(overloadedOrStalled)
        self.sensorArm.reset()
        self.sensorArm.on_for_degrees(SpeedPercent(20),10)  

        self.lidArm.on(SpeedPercent(-20))
        self.lidArm.wait(overloadedOrStalled)
        self.lidArm.reset()       
        self.lidArm.on_for_degrees(SpeedPercent(20),10)     

    def _send_event(self, name: EventName, payload):
        """
        Sends a custom event to trigger a sentry action.
        :param name: the name of the custom event
        :param payload: the event JSON payload
        """
        self.send_custom_event('Custom.Mindstorms.Gadget', name.value, payload)                   
    
def overloadedOrStalled(motorState):
    print("checking motorState: ({})".format(motorState), file=sys.stderr)
    return (('overloaded' in motorState) or ('stalled' in motorState))


if __name__ == '__main__':

    gadget = MindstormsGadget()

    # Set LCD font and turn off blinking LEDs
    os.system('setfont Lat7-Terminus12x6')
    gadget.leds.set_color("LEFT", "BLACK")
    gadget.leds.set_color("RIGHT", "BLACK")

    # Startup sequence
    gadget.sound.play_song((('C4', 'e'), ('D4', 'e'), ('E5', 'q')))
    gadget.leds.set_color("LEFT", "GREEN")
    gadget.leds.set_color("RIGHT", "GREEN")

    # Gadget main entry point
    gadget.main()

    # Shutdown sequence
    gadget.sound.play_song((('E5', 'e'), ('C4', 'e')))
    gadget.leds.set_color("LEFT", "BLACK")
    gadget.leds.set_color("RIGHT", "BLACK")

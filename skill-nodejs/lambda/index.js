/*
 * Copyright 2019 Amazon.com, Inc. or its affiliates.  All Rights Reserved.
 *
 * You may not use this file except in compliance with the terms and conditions 
 * set forth in the accompanying LICENSE.TXT file.
 *
 * THESE MATERIALS ARE PROVIDED ON AN "AS IS" BASIS. AMAZON SPECIFICALLY DISCLAIMS, WITH 
 * RESPECT TO THESE MATERIALS, ALL WARRANTIES, EXPRESS, IMPLIED, OR STATUTORY, INCLUDING 
 * THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
*/

// This skill sample demonstrates how to send directives and receive events from an Echo connected gadget.
// This skill uses the Alexa Skills Kit SDK (v2). Please visit https://alexa.design/cookbook for additional
// examples on implementing slots, dialog management, session persistence, api calls, and more.

const Alexa = require('ask-sdk-core');
const Util = require('./util');
const Common = require('./common');

// The audio tag to include background music
const BG_MUSIC = '<audio src="soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_waiting_loop_30s_01"/>';

// The namespace of the custom directive to be sent by this skill
const NAMESPACE = 'Custom.Mindstorms.Gadget';

// The name of the custom directive to be sent this skill
const NAME_CONTROL = 'control';

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle: async function(handlerInput) {

        const request = handlerInput.requestEnvelope;
        const { apiEndpoint, apiAccessToken } = request.context.System;
        const apiResponse = await Util.getConnectedEndpoints(apiEndpoint, apiAccessToken);
        if ((apiResponse.endpoints || []).length === 0) {
            return handlerInput.responseBuilder
            .speak(`I couldn't find an EV3 Brick connected to this Echo device. Please check to make sure your EV3 Brick is connected, and try again.`)
            .getResponse();
        }

        // Store the gadget endpointId to be used in this skill session
        const endpointId = apiResponse.endpoints[0].endpointId || [];
        Util.putSessionAttribute(handlerInput, 'endpointId', endpointId);

        // Set skill duration to 5 minutes (ten 30-seconds interval)
        Util.putSessionAttribute(handlerInput, 'duration', 10);

        // Set the token to track the event handler
        const token = handlerInput.requestEnvelope.request.requestId;
        Util.putSessionAttribute(handlerInput, 'token', token);

        let speechOutput = "Welcome, waffle lover! How may I serve you?";
        return handlerInput.responseBuilder
            .speak(speechOutput + BG_MUSIC)
            .addDirective(Util.buildStartEventHandler(token,60000, {}))
            .getResponse();
    }
};

const SetCookTimeIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SetCookTimeIntent';
    },
    handle: function (handlerInput) {

        // Bound cookTimeMinutes to (4-6)
        let cookTimeMinutes = Alexa.getSlotValue(handlerInput.requestEnvelope, 'CookTimeMinutes');
        cookTimeMinutes = Math.max(4, Math.min(6, cookTimeMinutes));
        // Validate cookTimeMinutes as integer
        if (!Number.isInteger(cookTimeMinutes)) {
            return handlerInput.responseBuilder
                .speak("Can you repeat that?")
                .reprompt("What was that again?").getResponse();
        }        

        Util.putSessionAttribute(handlerInput, 'cookTimeMinutes', cookTimeMinutes);

        // Bound cookTimeSeconds to (0-59)
        let cookTimeSeconds = Alexa.getSlotValue(handlerInput.requestEnvelope, 'CookTimeSeconds') || 0;
        cookTimeSeconds = Math.max(0, Math.min(59, cookTimeSeconds));
        // Validate cookTimeSeconds as integer
        if (!Number.isInteger(cookTimeSeconds)) {
            return handlerInput.responseBuilder
                .speak("Can you repeat that?")
                .reprompt("What was that again?").getResponse();
        }        

        Util.putSessionAttribute(handlerInput, 'cookTimeSeconds', cookTimeSeconds);        

        let speechOutput = `waffle cook time set to ${cookTimeMinutes} minutes and ${cookTimeSeconds} seconds.`;
        return handlerInput.responseBuilder
            .speak(speechOutput + BG_MUSIC)
            .getResponse();
    }
};

const SetDispenseTimeIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SetDispenseTimeIntent';
    },
    handle: function (handlerInput) {

        // Bound dispenseTimeSeconds to (1-6)
        let dispenseTimeSeconds = Alexa.getSlotValue(handlerInput.requestEnvelope, 'DispenseTimeSeconds');
        dispenseTimeSeconds = Math.max(1, Math.min(6, dispenseTimeSeconds));
        // validate dispense time seconds as integer
        if (!Number.isInteger(dispenseTimeSeconds)) {
            return handlerInput.responseBuilder
                .speak("Can you repeat that?")
                .reprompt("What was that again?").getResponse();
        } 

        Util.putSessionAttribute(handlerInput, 'dispenseTimeSeconds', dispenseTimeSeconds);

        let speechOutput = `batter dispense time set to ${dispenseTimeSeconds} seconds.`;
        return handlerInput.responseBuilder
            .speak(speechOutput + BG_MUSIC)
            .getResponse();
    }
};

// Construct and send a custom directive to the connected gadget with
// data from the MakeWafflesIntent.
const MakeWafflesIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'MakeWafflesIntent';
    },
    handle: function (handlerInput) {
        const request = handlerInput.requestEnvelope;
        //optional attributes, use default if not available
        const desiredWaffles = Alexa.getSlotValue(request, 'DesiredWaffles') || "1";

        // Get data from session attribute
        const attributesManager = handlerInput.attributesManager;
        const cookTimeMinutes = attributesManager.getSessionAttributes().cookTimeMinutes || "4";
        const cookTimeSeconds = attributesManager.getSessionAttributes().cookTimeSeconds || "0";
        const dispenseTimeSeconds = attributesManager.getSessionAttributes().dispenseTimeSeconds || "2";
        const endpointId = attributesManager.getSessionAttributes().endpointId || [];
        
        // update the session duration to comfortably accommodate the waffle cook time
        const makeWafflesSessionDuration = ((parseInt(desiredWaffles) * 6) + 10);
        Util.putSessionAttribute(handlerInput, 'duration', makeWafflesSessionDuration);

        // Construct the directive with the payload containing the move parameters
        let directive = Util.build(endpointId, NAMESPACE, NAME_CONTROL,
            {
                type: 'makeWaffles',
                desiredWaffles: desiredWaffles,
                cookTimeMinutes: cookTimeMinutes,
                cookTimeSeconds: cookTimeSeconds,
                dispenseTimeSeconds: dispenseTimeSeconds
            });

        const speechOutput = `Now making ${desiredWaffles} waffles`;

        return handlerInput.responseBuilder
            .speak(speechOutput + BG_MUSIC)
            .addDirective(directive)
            .getResponse();
    }
};

const EventsReceivedRequestHandler = {
    // Checks for a valid token and endpoint.
    canHandle(handlerInput) {
        let { request } = handlerInput.requestEnvelope;
        console.log('Request type: ' + Alexa.getRequestType(handlerInput.requestEnvelope));
        if (request.type !== 'CustomInterfaceController.EventsReceived') return false;

        const attributesManager = handlerInput.attributesManager;
        let sessionAttributes = attributesManager.getSessionAttributes();
        let customEvent = request.events[0];

        // Validate event token
        if (sessionAttributes.token !== request.token) {
            console.log("Event token doesn't match. Ignoring this event");
            return false;
        }

        // Validate endpoint
        let requestEndpoint = customEvent.endpoint.endpointId;
        if (requestEndpoint !== sessionAttributes.endpointId) {
            console.log("Event endpoint id doesn't match. Ignoring this event");
            return false;
        }
        return true;
    },
    handle(handlerInput) {

        console.log("== Received Custom Event ==");
        let customEvent = handlerInput.requestEnvelope.request.events[0];
        let payload = customEvent.payload;
        let name = customEvent.header.name;

        let speechOutput;

        if (name === 'Speech') {
            speechOutput = payload.speechOut;

        } else {
            speechOutput = "Event not recognized. Awaiting new command.";
        }

        return handlerInput.responseBuilder
            .speak(speechOutput + BG_MUSIC, "REPLACE_ALL")
            .getResponse();
    }
};
const ExpiredRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'CustomInterfaceController.Expired'
    },
    handle(handlerInput) {
        console.log("== Custom Event Expiration Input ==");

        // Set the token to track the event handler
        const token = handlerInput.requestEnvelope.request.requestId;
        Util.putSessionAttribute(handlerInput, 'token', token);

        const attributesManager = handlerInput.attributesManager;
        let duration = attributesManager.getSessionAttributes().duration || 0;
        if (duration > 0) {
            Util.putSessionAttribute(handlerInput, 'duration', --duration);

            // Extends skill session
            //const speechOutput = `${duration} minutes remaining.`;
            return handlerInput.responseBuilder
                .addDirective(Util.buildStartEventHandler(token, 60000, {}))
                .speak(BG_MUSIC)
                .getResponse();
        }
        else {
            // End skill session
            return handlerInput.responseBuilder
                .speak("Skill duration expired. Goodbye.")
                .withShouldEndSession(true)
                .getResponse();
        }
    }
};

// The SkillBuilder acts as the entry point for your skill, routing all request and response
// payloads to the handlers above. Make sure any new handlers or interceptors you've
// defined are included below. The order matters - they're processed top to bottom.
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        SetCookTimeIntentHandler,
        SetDispenseTimeIntentHandler,
        MakeWafflesIntentHandler,
        EventsReceivedRequestHandler,
        ExpiredRequestHandler,
        Common.HelpIntentHandler,
        Common.CancelAndStopIntentHandler,
        Common.SessionEndedRequestHandler,
        Common.IntentReflectorHandler, // make sure IntentReflectorHandler is last so it doesn't override your custom intent handlers
    )
    .addRequestInterceptors(Common.RequestInterceptor)
    .addErrorHandlers(
        Common.ErrorHandler,
    )
    .lambda();

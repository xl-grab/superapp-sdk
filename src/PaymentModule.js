/**
 * Copyright (c) Grab Taxi Holdings PTE LTD (GRAB)
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import bridgeSDK from '@grabjs/mobile-kit-bridge-sdk';
import EventEmitter from 'eventemitter3';

/**
 * Bridge class to handle communication between React and native modules.
 */
export class PaymentModule extends EventEmitter {
  constructor() {
    super();
    this.nativeHandler = this.getNativeBridge();
    this.transactionPromises = new Map();
    this.setupNativeEventListener();
  }

  /**
   * Retrieves the native bridge object based on the platform.
   * @returns {any} The native bridge object or null.
   */
  getNativeBridge() {
    // Android
    if (window.NativeHandler) {
      return window.NativeHandler;
    }
    // iOS
    else if (
      window.webkit &&
      window.webkit.messageHandlers &&
      window.webkit.messageHandlers.nativeHandler
    ) {
      return window.webkit.messageHandlers.nativeHandler;
    }
    return null;
  }

  /**
   * Sets up an event listener for payment completion events from native modules.
   */
  setupNativeEventListener() {
    window.addEventListener('paymentCompleted', (event) => {
      const paymentCompletion = event.detail;
      this.handlePaymentCompleted(paymentCompletion);
    });
  }

  /**
   * Initiates a payment transaction by communicating with the backend server.
   * @returns {Promise<string>} A promise that resolves with the transaction ID.
   */
  initiateTransaction(partnerTransactionID, amount) {
    return new Promise(function(resolve, reject) {
      fetch('http://localhost:8080/v3/partner/boxo/api/create-order-payment/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          'app_id': 'app97880',
          'order': {
            'amount': amount,
            'currency': 'SGD',
            'miniapp_order_id': partnerTransactionID
          }
        }),
      })
        .then(function(response) {
          if (!response.ok) {
            throw new Error('Server responded with status ' + response.status);
          }
          return response.json();
        })
        .then(function(data) {
          console.log(data.order_payment_id)
          resolve(data.order_payment_id)
        })
        .catch(function(error) {
          console.error('Failed to initiate transaction:', error);
          reject(error);
        });
    });
  }

  /**
   * Triggers the native payment flow with the given transaction ID.
   * @param {string} transactionId - The unique ID of the transaction.
   * @returns {Promise<void>} A promise that resolves when the native payment is triggered.
   */
  triggerNativePayment(transactionId) {
    return new Promise((resolve, reject) => {
      if (!this.nativeHandler) {
        return reject(new Error('Native bridge not available'));
      }

      const params = {
        method: 'triggerPayment',
        data: { transactionId },
      };

      // Store the resolve and reject functions to handle later
      this.transactionPromises.set(transactionId, { resolve, reject });

      try {
        if (typeof this.nativeHandler.triggerPayment === 'function') {
          // For Android: window.nativeHandler.triggerPayment(JSON.stringify(params))
          this.nativeHandler.triggerPayment(JSON.stringify(params));
        } else if (typeof this.nativeHandler.postMessage === 'function') {
          // For iOS: window.webkit.messageHandlers.nativeHandler.postMessage(params)
          this.nativeHandler.postMessage(params);
        } else {
          throw new Error('triggerPayment method not found on native bridge');
        }
      } catch (error) {
        console.error('Error triggering native payment:', error);
        this.transactionPromises.delete(transactionId);
        reject(error);
      }
    });
  }

  /**
   * Handles the payment completion event from native modules.
   * @param {PaymentStatusResponse} event - The payment completion event data.
   */
  handlePaymentCompleted(event) {
    const { transactionId, status, details } = event;

    const promiseHandlers = this.transactionPromises.get(transactionId);

    if (promiseHandlers) {
      const { resolve, reject } = promiseHandlers;

      if (status === 'completed') {
        resolve();
      } else {
        reject(new Error(details || 'Payment failed'));
      }

      // Remove the handlers as they are no longer needed
      this.transactionPromises.delete(transactionId);
    } else {
      console.warn(`No matching promise found for transaction ID: ${transactionId}`);
    }

    // Optionally, emit an event for React components to listen to
    this.emit('paymentCompleted', event);
  }

  /**
   * Orchestrates the entire payment process.
   * @returns {Promise<void>} A promise that resolves when the payment is completed.
   */
  processPayment(partnerTransactionID, amount) {
    var self = this;
    return self.initiateTransaction(partnerTransactionID, amount)
      .then(function(transactionId) {
        console.log('Transaction initiated with ID:', transactionId);
        return self.triggerNativePayment(transactionId);
      })
      .then(function() {
        console.log('Native payment flow triggered.');
        // Payment completion is handled via event listener
      })
      .catch(function(error) {
        console.error('Payment processing failed:', error);
        throw error;
      });
  }
}
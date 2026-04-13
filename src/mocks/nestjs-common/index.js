"use strict";
exports.__esModule = true;
exports.Body = function() { return function() {}; };
exports.Controller = function() { return function() {}; };
exports.Post = function() { return function() {}; };
exports.Res = function() { return function() {}; };
exports.Headers = function() { return function() {}; };
exports.UseGuards = function() { return function() {}; };
exports.Injectable = function() { return function() {}; };
exports.HttpException = class extends Error {
  constructor(response, status) {
    super(typeof response === 'string' ? response : JSON.stringify(response));
    this.response = response;
    this.status = status;
  }
};

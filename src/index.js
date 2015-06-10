
"use strict";

const fs   = require("fs");
const path = require("path");
const util = require("util");

const clone = require("clone");

const merge = require("./merge");

const validatorsPath = path.resolve(__dirname, "../validators");

const files = fs.readdirSync(validatorsPath);

let validators = {};

files.forEach(function(file) {
  const t = require(path.join(validatorsPath, file));
  validators[t.name] = makeValidator(t.name, t.fn);
});

function makeValidator(validatorName, validatorFunc) {

  // validatorFunc takes arguments, child-validators || null, and the data to
  // parse, it should throw an Error if the data is invalid, containing a
  // reason. Otherwise it should return a value.
  // This value can be mutated, it will be the "validated" value.

  return function validator(...args) {

    let opts = {}, childValidators = {};

    for(let i = 0; i < args.length; i++) {

      let arg = args[i];

      if((validatorFunc.hasChildValidators == 'array' && Array.isArray(arg)) || (typeof arg === validatorFunc.hasChildValidators)) {

        if(Object.keys(arg).every(function(k) {
          return arg[k].hasOwnProperty('$validators');
        })) {
          childValidators = arg;
          continue;
        }

      }

      opts = arg;

    }

    if(!Object.keys(opts).length) {

      // If we have no custom arguments
      // try to load the fast version
      // of the validator.
      const fastValidatorName = "Fast" + validatorName;
      const fastValidatorFunc = validators[fastValidatorName];

      if(fastValidatorFunc) {
        return fastValidatorFunc(opts, childValidators);
      }

    }

    return new Validator(validatorName, validatorFunc, opts, childValidators);

  };
}

function Validator(name, validatorFunc, args, childValidators) {

  this.$name          = name;
  this.$validatorFunc = validatorFunc;
  this.$args          = args;
  this.$validators    = childValidators;

  const getValidatorFn = function(k) {
    return function() {
      return this.$validators[k];
    }.bind(this);
  }.bind(this);

  this.keys = {};

  if(this.$validators && typeof this.$validators === "object" && !Array.isArray(this.$validators) && Object.keys(this.$validators).length) {
    for(let k in this.$validators) {
      Object.defineProperty(this.keys, k, {
        get: getValidatorFn(k)
      });
    }
  }

}

Validator.prototype.parse = function(data, key, first) {
  //All validators should handle opt (optional)
  const args = merge(this.$args, { opt: false });
  const val = this.$validatorFunc(args, this.$validators, data, key);
  if(first && val !== null && typeof val == "object" && val.htDeleteKey) return null;
  return val;
};

Validator.prototype.validate = function(data, key, callback) {
  if(typeof key === 'function') {
    callback = key;
    key = undefined;
  }
  function fin(err, res) {
    if(callback) {
      return setImmediate(() => callback(err, res));
    } else {
      if(err) {
        throw err;
      } else {
        return res;
      }
    }
  }
  let val;
  try {
    val = this.parse(data, key || "schema", true);
  } catch(e) {
    return fin(e);
  }
  return fin(null, val);
};

Validator.prototype.document = function() {
  let obj = {
    name: this.$name,
    args: this.$args
  }
  let children = {};
  for(let k in this.$validators) {
    children[k] = this.$validators[k].document();
  }

  if(this.$validatorFunc.hasChildValidators === "array") {
    obj.children = Object.keys(children).map((k) => children[k]);
  } else if(Object.keys(children).length) {
    obj.children = children;
  }
  if(this.$comment) {
    obj.comment = typeof this.$comment === 'function' ? this.$comment(obj) : this.$comment;
  }
  return obj;
};

Validator.prototype.clone = function(...params) {

  let validatorFunc   = clone(this.$validatorFunc);
  let args            = clone(this.$args);
  let childValidators = clone(this.$validators);

  params.forEach(function(arg) {
    if(arg && typeof childValidators === 'object') {
      if(Array.isArray(arg)) {
        // If arg is an array, it's a whitelist
        for(let k in childValidators) {
          if(!~arg.indexOf(k)) {
            delete childValidators[k];
          }
        }
      } else if(typeof arg === 'object') {
        // If arg is an object, it's probably new "args"
        args = merge(arg, args);
      }
    }
  });

  return new Validator(this.$name, validatorFunc, args, childValidators);

};

Validator.prototype.comment = function(comment) {
  this.$comment = comment;
  return this;
}

validators.makeValidator = makeValidator;
module.exports = validators;

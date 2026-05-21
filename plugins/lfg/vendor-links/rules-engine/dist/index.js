// @bun
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);

// vendor/omo-standalone/node_modules/.bun/picomatch@4.0.4/node_modules/picomatch/lib/constants.js
var require_constants = __commonJS((exports, module) => {
  var WIN_SLASH = "\\\\/";
  var WIN_NO_SLASH = `[^${WIN_SLASH}]`;
  var DEFAULT_MAX_EXTGLOB_RECURSION = 0;
  var DOT_LITERAL = "\\.";
  var PLUS_LITERAL = "\\+";
  var QMARK_LITERAL = "\\?";
  var SLASH_LITERAL = "\\/";
  var ONE_CHAR = "(?=.)";
  var QMARK = "[^/]";
  var END_ANCHOR = `(?:${SLASH_LITERAL}|$)`;
  var START_ANCHOR = `(?:^|${SLASH_LITERAL})`;
  var DOTS_SLASH = `${DOT_LITERAL}{1,2}${END_ANCHOR}`;
  var NO_DOT = `(?!${DOT_LITERAL})`;
  var NO_DOTS = `(?!${START_ANCHOR}${DOTS_SLASH})`;
  var NO_DOT_SLASH = `(?!${DOT_LITERAL}{0,1}${END_ANCHOR})`;
  var NO_DOTS_SLASH = `(?!${DOTS_SLASH})`;
  var QMARK_NO_DOT = `[^.${SLASH_LITERAL}]`;
  var STAR = `${QMARK}*?`;
  var SEP = "/";
  var POSIX_CHARS = {
    DOT_LITERAL,
    PLUS_LITERAL,
    QMARK_LITERAL,
    SLASH_LITERAL,
    ONE_CHAR,
    QMARK,
    END_ANCHOR,
    DOTS_SLASH,
    NO_DOT,
    NO_DOTS,
    NO_DOT_SLASH,
    NO_DOTS_SLASH,
    QMARK_NO_DOT,
    STAR,
    START_ANCHOR,
    SEP
  };
  var WINDOWS_CHARS = {
    ...POSIX_CHARS,
    SLASH_LITERAL: `[${WIN_SLASH}]`,
    QMARK: WIN_NO_SLASH,
    STAR: `${WIN_NO_SLASH}*?`,
    DOTS_SLASH: `${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$)`,
    NO_DOT: `(?!${DOT_LITERAL})`,
    NO_DOTS: `(?!(?:^|[${WIN_SLASH}])${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
    NO_DOT_SLASH: `(?!${DOT_LITERAL}{0,1}(?:[${WIN_SLASH}]|$))`,
    NO_DOTS_SLASH: `(?!${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
    QMARK_NO_DOT: `[^.${WIN_SLASH}]`,
    START_ANCHOR: `(?:^|[${WIN_SLASH}])`,
    END_ANCHOR: `(?:[${WIN_SLASH}]|$)`,
    SEP: "\\"
  };
  var POSIX_REGEX_SOURCE = {
    __proto__: null,
    alnum: "a-zA-Z0-9",
    alpha: "a-zA-Z",
    ascii: "\\x00-\\x7F",
    blank: " \\t",
    cntrl: "\\x00-\\x1F\\x7F",
    digit: "0-9",
    graph: "\\x21-\\x7E",
    lower: "a-z",
    print: "\\x20-\\x7E ",
    punct: "\\-!\"#$%&'()\\*+,./:;<=>?@[\\]^_`{|}~",
    space: " \\t\\r\\n\\v\\f",
    upper: "A-Z",
    word: "A-Za-z0-9_",
    xdigit: "A-Fa-f0-9"
  };
  module.exports = {
    DEFAULT_MAX_EXTGLOB_RECURSION,
    MAX_LENGTH: 1024 * 64,
    POSIX_REGEX_SOURCE,
    REGEX_BACKSLASH: /\\(?![*+?^${}(|)[\]])/g,
    REGEX_NON_SPECIAL_CHARS: /^[^@![\].,$*+?^{}()|\\/]+/,
    REGEX_SPECIAL_CHARS: /[-*+?.^${}(|)[\]]/,
    REGEX_SPECIAL_CHARS_BACKREF: /(\\?)((\W)(\3*))/g,
    REGEX_SPECIAL_CHARS_GLOBAL: /([-*+?.^${}(|)[\]])/g,
    REGEX_REMOVE_BACKSLASH: /(?:\[.*?[^\\]\]|\\(?=.))/g,
    REPLACEMENTS: {
      __proto__: null,
      "***": "*",
      "**/**": "**",
      "**/**/**": "**"
    },
    CHAR_0: 48,
    CHAR_9: 57,
    CHAR_UPPERCASE_A: 65,
    CHAR_LOWERCASE_A: 97,
    CHAR_UPPERCASE_Z: 90,
    CHAR_LOWERCASE_Z: 122,
    CHAR_LEFT_PARENTHESES: 40,
    CHAR_RIGHT_PARENTHESES: 41,
    CHAR_ASTERISK: 42,
    CHAR_AMPERSAND: 38,
    CHAR_AT: 64,
    CHAR_BACKWARD_SLASH: 92,
    CHAR_CARRIAGE_RETURN: 13,
    CHAR_CIRCUMFLEX_ACCENT: 94,
    CHAR_COLON: 58,
    CHAR_COMMA: 44,
    CHAR_DOT: 46,
    CHAR_DOUBLE_QUOTE: 34,
    CHAR_EQUAL: 61,
    CHAR_EXCLAMATION_MARK: 33,
    CHAR_FORM_FEED: 12,
    CHAR_FORWARD_SLASH: 47,
    CHAR_GRAVE_ACCENT: 96,
    CHAR_HASH: 35,
    CHAR_HYPHEN_MINUS: 45,
    CHAR_LEFT_ANGLE_BRACKET: 60,
    CHAR_LEFT_CURLY_BRACE: 123,
    CHAR_LEFT_SQUARE_BRACKET: 91,
    CHAR_LINE_FEED: 10,
    CHAR_NO_BREAK_SPACE: 160,
    CHAR_PERCENT: 37,
    CHAR_PLUS: 43,
    CHAR_QUESTION_MARK: 63,
    CHAR_RIGHT_ANGLE_BRACKET: 62,
    CHAR_RIGHT_CURLY_BRACE: 125,
    CHAR_RIGHT_SQUARE_BRACKET: 93,
    CHAR_SEMICOLON: 59,
    CHAR_SINGLE_QUOTE: 39,
    CHAR_SPACE: 32,
    CHAR_TAB: 9,
    CHAR_UNDERSCORE: 95,
    CHAR_VERTICAL_LINE: 124,
    CHAR_ZERO_WIDTH_NOBREAK_SPACE: 65279,
    extglobChars(chars) {
      return {
        "!": { type: "negate", open: "(?:(?!(?:", close: `))${chars.STAR})` },
        "?": { type: "qmark", open: "(?:", close: ")?" },
        "+": { type: "plus", open: "(?:", close: ")+" },
        "*": { type: "star", open: "(?:", close: ")*" },
        "@": { type: "at", open: "(?:", close: ")" }
      };
    },
    globChars(win32) {
      return win32 === true ? WINDOWS_CHARS : POSIX_CHARS;
    }
  };
});

// vendor/omo-standalone/node_modules/.bun/picomatch@4.0.4/node_modules/picomatch/lib/utils.js
var require_utils = __commonJS((exports) => {
  var {
    REGEX_BACKSLASH,
    REGEX_REMOVE_BACKSLASH,
    REGEX_SPECIAL_CHARS,
    REGEX_SPECIAL_CHARS_GLOBAL
  } = require_constants();
  exports.isObject = (val) => val !== null && typeof val === "object" && !Array.isArray(val);
  exports.hasRegexChars = (str) => REGEX_SPECIAL_CHARS.test(str);
  exports.isRegexChar = (str) => str.length === 1 && exports.hasRegexChars(str);
  exports.escapeRegex = (str) => str.replace(REGEX_SPECIAL_CHARS_GLOBAL, "\\$1");
  exports.toPosixSlashes = (str) => str.replace(REGEX_BACKSLASH, "/");
  exports.isWindows = () => {
    if (typeof navigator !== "undefined" && navigator.platform) {
      const platform = navigator.platform.toLowerCase();
      return platform === "win32" || platform === "windows";
    }
    if (typeof process !== "undefined" && process.platform) {
      return process.platform === "win32";
    }
    return false;
  };
  exports.removeBackslashes = (str) => {
    return str.replace(REGEX_REMOVE_BACKSLASH, (match) => {
      return match === "\\" ? "" : match;
    });
  };
  exports.escapeLast = (input, char, lastIdx) => {
    const idx = input.lastIndexOf(char, lastIdx);
    if (idx === -1)
      return input;
    if (input[idx - 1] === "\\")
      return exports.escapeLast(input, char, idx - 1);
    return `${input.slice(0, idx)}\\${input.slice(idx)}`;
  };
  exports.removePrefix = (input, state = {}) => {
    let output = input;
    if (output.startsWith("./")) {
      output = output.slice(2);
      state.prefix = "./";
    }
    return output;
  };
  exports.wrapOutput = (input, state = {}, options = {}) => {
    const prepend = options.contains ? "" : "^";
    const append = options.contains ? "" : "$";
    let output = `${prepend}(?:${input})${append}`;
    if (state.negated === true) {
      output = `(?:^(?!${output}).*$)`;
    }
    return output;
  };
  exports.basename = (path, { windows } = {}) => {
    const segs = path.split(windows ? /[\\/]/ : "/");
    const last = segs[segs.length - 1];
    if (last === "") {
      return segs[segs.length - 2];
    }
    return last;
  };
});

// vendor/omo-standalone/node_modules/.bun/picomatch@4.0.4/node_modules/picomatch/lib/scan.js
var require_scan = __commonJS((exports, module) => {
  var utils = require_utils();
  var {
    CHAR_ASTERISK,
    CHAR_AT,
    CHAR_BACKWARD_SLASH,
    CHAR_COMMA,
    CHAR_DOT,
    CHAR_EXCLAMATION_MARK,
    CHAR_FORWARD_SLASH,
    CHAR_LEFT_CURLY_BRACE,
    CHAR_LEFT_PARENTHESES,
    CHAR_LEFT_SQUARE_BRACKET,
    CHAR_PLUS,
    CHAR_QUESTION_MARK,
    CHAR_RIGHT_CURLY_BRACE,
    CHAR_RIGHT_PARENTHESES,
    CHAR_RIGHT_SQUARE_BRACKET
  } = require_constants();
  var isPathSeparator = (code) => {
    return code === CHAR_FORWARD_SLASH || code === CHAR_BACKWARD_SLASH;
  };
  var depth = (token) => {
    if (token.isPrefix !== true) {
      token.depth = token.isGlobstar ? Infinity : 1;
    }
  };
  var scan = (input, options) => {
    const opts = options || {};
    const length = input.length - 1;
    const scanToEnd = opts.parts === true || opts.scanToEnd === true;
    const slashes = [];
    const tokens = [];
    const parts = [];
    let str = input;
    let index = -1;
    let start = 0;
    let lastIndex = 0;
    let isBrace = false;
    let isBracket = false;
    let isGlob = false;
    let isExtglob = false;
    let isGlobstar = false;
    let braceEscaped = false;
    let backslashes = false;
    let negated = false;
    let negatedExtglob = false;
    let finished = false;
    let braces = 0;
    let prev;
    let code;
    let token = { value: "", depth: 0, isGlob: false };
    const eos = () => index >= length;
    const peek = () => str.charCodeAt(index + 1);
    const advance = () => {
      prev = code;
      return str.charCodeAt(++index);
    };
    while (index < length) {
      code = advance();
      let next;
      if (code === CHAR_BACKWARD_SLASH) {
        backslashes = token.backslashes = true;
        code = advance();
        if (code === CHAR_LEFT_CURLY_BRACE) {
          braceEscaped = true;
        }
        continue;
      }
      if (braceEscaped === true || code === CHAR_LEFT_CURLY_BRACE) {
        braces++;
        while (eos() !== true && (code = advance())) {
          if (code === CHAR_BACKWARD_SLASH) {
            backslashes = token.backslashes = true;
            advance();
            continue;
          }
          if (code === CHAR_LEFT_CURLY_BRACE) {
            braces++;
            continue;
          }
          if (braceEscaped !== true && code === CHAR_DOT && (code = advance()) === CHAR_DOT) {
            isBrace = token.isBrace = true;
            isGlob = token.isGlob = true;
            finished = true;
            if (scanToEnd === true) {
              continue;
            }
            break;
          }
          if (braceEscaped !== true && code === CHAR_COMMA) {
            isBrace = token.isBrace = true;
            isGlob = token.isGlob = true;
            finished = true;
            if (scanToEnd === true) {
              continue;
            }
            break;
          }
          if (code === CHAR_RIGHT_CURLY_BRACE) {
            braces--;
            if (braces === 0) {
              braceEscaped = false;
              isBrace = token.isBrace = true;
              finished = true;
              break;
            }
          }
        }
        if (scanToEnd === true) {
          continue;
        }
        break;
      }
      if (code === CHAR_FORWARD_SLASH) {
        slashes.push(index);
        tokens.push(token);
        token = { value: "", depth: 0, isGlob: false };
        if (finished === true)
          continue;
        if (prev === CHAR_DOT && index === start + 1) {
          start += 2;
          continue;
        }
        lastIndex = index + 1;
        continue;
      }
      if (opts.noext !== true) {
        const isExtglobChar = code === CHAR_PLUS || code === CHAR_AT || code === CHAR_ASTERISK || code === CHAR_QUESTION_MARK || code === CHAR_EXCLAMATION_MARK;
        if (isExtglobChar === true && peek() === CHAR_LEFT_PARENTHESES) {
          isGlob = token.isGlob = true;
          isExtglob = token.isExtglob = true;
          finished = true;
          if (code === CHAR_EXCLAMATION_MARK && index === start) {
            negatedExtglob = true;
          }
          if (scanToEnd === true) {
            while (eos() !== true && (code = advance())) {
              if (code === CHAR_BACKWARD_SLASH) {
                backslashes = token.backslashes = true;
                code = advance();
                continue;
              }
              if (code === CHAR_RIGHT_PARENTHESES) {
                isGlob = token.isGlob = true;
                finished = true;
                break;
              }
            }
            continue;
          }
          break;
        }
      }
      if (code === CHAR_ASTERISK) {
        if (prev === CHAR_ASTERISK)
          isGlobstar = token.isGlobstar = true;
        isGlob = token.isGlob = true;
        finished = true;
        if (scanToEnd === true) {
          continue;
        }
        break;
      }
      if (code === CHAR_QUESTION_MARK) {
        isGlob = token.isGlob = true;
        finished = true;
        if (scanToEnd === true) {
          continue;
        }
        break;
      }
      if (code === CHAR_LEFT_SQUARE_BRACKET) {
        while (eos() !== true && (next = advance())) {
          if (next === CHAR_BACKWARD_SLASH) {
            backslashes = token.backslashes = true;
            advance();
            continue;
          }
          if (next === CHAR_RIGHT_SQUARE_BRACKET) {
            isBracket = token.isBracket = true;
            isGlob = token.isGlob = true;
            finished = true;
            break;
          }
        }
        if (scanToEnd === true) {
          continue;
        }
        break;
      }
      if (opts.nonegate !== true && code === CHAR_EXCLAMATION_MARK && index === start) {
        negated = token.negated = true;
        start++;
        continue;
      }
      if (opts.noparen !== true && code === CHAR_LEFT_PARENTHESES) {
        isGlob = token.isGlob = true;
        if (scanToEnd === true) {
          while (eos() !== true && (code = advance())) {
            if (code === CHAR_LEFT_PARENTHESES) {
              backslashes = token.backslashes = true;
              code = advance();
              continue;
            }
            if (code === CHAR_RIGHT_PARENTHESES) {
              finished = true;
              break;
            }
          }
          continue;
        }
        break;
      }
      if (isGlob === true) {
        finished = true;
        if (scanToEnd === true) {
          continue;
        }
        break;
      }
    }
    if (opts.noext === true) {
      isExtglob = false;
      isGlob = false;
    }
    let base = str;
    let prefix = "";
    let glob = "";
    if (start > 0) {
      prefix = str.slice(0, start);
      str = str.slice(start);
      lastIndex -= start;
    }
    if (base && isGlob === true && lastIndex > 0) {
      base = str.slice(0, lastIndex);
      glob = str.slice(lastIndex);
    } else if (isGlob === true) {
      base = "";
      glob = str;
    } else {
      base = str;
    }
    if (base && base !== "" && base !== "/" && base !== str) {
      if (isPathSeparator(base.charCodeAt(base.length - 1))) {
        base = base.slice(0, -1);
      }
    }
    if (opts.unescape === true) {
      if (glob)
        glob = utils.removeBackslashes(glob);
      if (base && backslashes === true) {
        base = utils.removeBackslashes(base);
      }
    }
    const state = {
      prefix,
      input,
      start,
      base,
      glob,
      isBrace,
      isBracket,
      isGlob,
      isExtglob,
      isGlobstar,
      negated,
      negatedExtglob
    };
    if (opts.tokens === true) {
      state.maxDepth = 0;
      if (!isPathSeparator(code)) {
        tokens.push(token);
      }
      state.tokens = tokens;
    }
    if (opts.parts === true || opts.tokens === true) {
      let prevIndex;
      for (let idx = 0;idx < slashes.length; idx++) {
        const n = prevIndex ? prevIndex + 1 : start;
        const i = slashes[idx];
        const value = input.slice(n, i);
        if (opts.tokens) {
          if (idx === 0 && start !== 0) {
            tokens[idx].isPrefix = true;
            tokens[idx].value = prefix;
          } else {
            tokens[idx].value = value;
          }
          depth(tokens[idx]);
          state.maxDepth += tokens[idx].depth;
        }
        if (idx !== 0 || value !== "") {
          parts.push(value);
        }
        prevIndex = i;
      }
      if (prevIndex && prevIndex + 1 < input.length) {
        const value = input.slice(prevIndex + 1);
        parts.push(value);
        if (opts.tokens) {
          tokens[tokens.length - 1].value = value;
          depth(tokens[tokens.length - 1]);
          state.maxDepth += tokens[tokens.length - 1].depth;
        }
      }
      state.slashes = slashes;
      state.parts = parts;
    }
    return state;
  };
  module.exports = scan;
});

// vendor/omo-standalone/node_modules/.bun/picomatch@4.0.4/node_modules/picomatch/lib/parse.js
var require_parse = __commonJS((exports, module) => {
  var constants = require_constants();
  var utils = require_utils();
  var {
    MAX_LENGTH,
    POSIX_REGEX_SOURCE,
    REGEX_NON_SPECIAL_CHARS,
    REGEX_SPECIAL_CHARS_BACKREF,
    REPLACEMENTS
  } = constants;
  var expandRange = (args, options) => {
    if (typeof options.expandRange === "function") {
      return options.expandRange(...args, options);
    }
    args.sort();
    const value = `[${args.join("-")}]`;
    try {
      new RegExp(value);
    } catch (ex) {
      return args.map((v) => utils.escapeRegex(v)).join("..");
    }
    return value;
  };
  var syntaxError = (type, char) => {
    return `Missing ${type}: "${char}" - use "\\\\${char}" to match literal characters`;
  };
  var splitTopLevel = (input) => {
    const parts = [];
    let bracket = 0;
    let paren = 0;
    let quote = 0;
    let value = "";
    let escaped = false;
    for (const ch of input) {
      if (escaped === true) {
        value += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        value += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        quote = quote === 1 ? 0 : 1;
        value += ch;
        continue;
      }
      if (quote === 0) {
        if (ch === "[") {
          bracket++;
        } else if (ch === "]" && bracket > 0) {
          bracket--;
        } else if (bracket === 0) {
          if (ch === "(") {
            paren++;
          } else if (ch === ")" && paren > 0) {
            paren--;
          } else if (ch === "|" && paren === 0) {
            parts.push(value);
            value = "";
            continue;
          }
        }
      }
      value += ch;
    }
    parts.push(value);
    return parts;
  };
  var isPlainBranch = (branch) => {
    let escaped = false;
    for (const ch of branch) {
      if (escaped === true) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (/[?*+@!()[\]{}]/.test(ch)) {
        return false;
      }
    }
    return true;
  };
  var normalizeSimpleBranch = (branch) => {
    let value = branch.trim();
    let changed = true;
    while (changed === true) {
      changed = false;
      if (/^@\([^\\()[\]{}|]+\)$/.test(value)) {
        value = value.slice(2, -1);
        changed = true;
      }
    }
    if (!isPlainBranch(value)) {
      return;
    }
    return value.replace(/\\(.)/g, "$1");
  };
  var hasRepeatedCharPrefixOverlap = (branches) => {
    const values = branches.map(normalizeSimpleBranch).filter(Boolean);
    for (let i = 0;i < values.length; i++) {
      for (let j = i + 1;j < values.length; j++) {
        const a = values[i];
        const b = values[j];
        const char = a[0];
        if (!char || a !== char.repeat(a.length) || b !== char.repeat(b.length)) {
          continue;
        }
        if (a === b || a.startsWith(b) || b.startsWith(a)) {
          return true;
        }
      }
    }
    return false;
  };
  var parseRepeatedExtglob = (pattern, requireEnd = true) => {
    if (pattern[0] !== "+" && pattern[0] !== "*" || pattern[1] !== "(") {
      return;
    }
    let bracket = 0;
    let paren = 0;
    let quote = 0;
    let escaped = false;
    for (let i = 1;i < pattern.length; i++) {
      const ch = pattern[i];
      if (escaped === true) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        quote = quote === 1 ? 0 : 1;
        continue;
      }
      if (quote === 1) {
        continue;
      }
      if (ch === "[") {
        bracket++;
        continue;
      }
      if (ch === "]" && bracket > 0) {
        bracket--;
        continue;
      }
      if (bracket > 0) {
        continue;
      }
      if (ch === "(") {
        paren++;
        continue;
      }
      if (ch === ")") {
        paren--;
        if (paren === 0) {
          if (requireEnd === true && i !== pattern.length - 1) {
            return;
          }
          return {
            type: pattern[0],
            body: pattern.slice(2, i),
            end: i
          };
        }
      }
    }
  };
  var getStarExtglobSequenceOutput = (pattern) => {
    let index = 0;
    const chars = [];
    while (index < pattern.length) {
      const match = parseRepeatedExtglob(pattern.slice(index), false);
      if (!match || match.type !== "*") {
        return;
      }
      const branches = splitTopLevel(match.body).map((branch2) => branch2.trim());
      if (branches.length !== 1) {
        return;
      }
      const branch = normalizeSimpleBranch(branches[0]);
      if (!branch || branch.length !== 1) {
        return;
      }
      chars.push(branch);
      index += match.end + 1;
    }
    if (chars.length < 1) {
      return;
    }
    const source = chars.length === 1 ? utils.escapeRegex(chars[0]) : `[${chars.map((ch) => utils.escapeRegex(ch)).join("")}]`;
    return `${source}*`;
  };
  var repeatedExtglobRecursion = (pattern) => {
    let depth = 0;
    let value = pattern.trim();
    let match = parseRepeatedExtglob(value);
    while (match) {
      depth++;
      value = match.body.trim();
      match = parseRepeatedExtglob(value);
    }
    return depth;
  };
  var analyzeRepeatedExtglob = (body, options) => {
    if (options.maxExtglobRecursion === false) {
      return { risky: false };
    }
    const max = typeof options.maxExtglobRecursion === "number" ? options.maxExtglobRecursion : constants.DEFAULT_MAX_EXTGLOB_RECURSION;
    const branches = splitTopLevel(body).map((branch) => branch.trim());
    if (branches.length > 1) {
      if (branches.some((branch) => branch === "") || branches.some((branch) => /^[*?]+$/.test(branch)) || hasRepeatedCharPrefixOverlap(branches)) {
        return { risky: true };
      }
    }
    for (const branch of branches) {
      const safeOutput = getStarExtglobSequenceOutput(branch);
      if (safeOutput) {
        return { risky: true, safeOutput };
      }
      if (repeatedExtglobRecursion(branch) > max) {
        return { risky: true };
      }
    }
    return { risky: false };
  };
  var parse = (input, options) => {
    if (typeof input !== "string") {
      throw new TypeError("Expected a string");
    }
    input = REPLACEMENTS[input] || input;
    const opts = { ...options };
    const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
    let len = input.length;
    if (len > max) {
      throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
    }
    const bos = { type: "bos", value: "", output: opts.prepend || "" };
    const tokens = [bos];
    const capture = opts.capture ? "" : "?:";
    const PLATFORM_CHARS = constants.globChars(opts.windows);
    const EXTGLOB_CHARS = constants.extglobChars(PLATFORM_CHARS);
    const {
      DOT_LITERAL,
      PLUS_LITERAL,
      SLASH_LITERAL,
      ONE_CHAR,
      DOTS_SLASH,
      NO_DOT,
      NO_DOT_SLASH,
      NO_DOTS_SLASH,
      QMARK,
      QMARK_NO_DOT,
      STAR,
      START_ANCHOR
    } = PLATFORM_CHARS;
    const globstar = (opts2) => {
      return `(${capture}(?:(?!${START_ANCHOR}${opts2.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
    };
    const nodot = opts.dot ? "" : NO_DOT;
    const qmarkNoDot = opts.dot ? QMARK : QMARK_NO_DOT;
    let star = opts.bash === true ? globstar(opts) : STAR;
    if (opts.capture) {
      star = `(${star})`;
    }
    if (typeof opts.noext === "boolean") {
      opts.noextglob = opts.noext;
    }
    const state = {
      input,
      index: -1,
      start: 0,
      dot: opts.dot === true,
      consumed: "",
      output: "",
      prefix: "",
      backtrack: false,
      negated: false,
      brackets: 0,
      braces: 0,
      parens: 0,
      quotes: 0,
      globstar: false,
      tokens
    };
    input = utils.removePrefix(input, state);
    len = input.length;
    const extglobs = [];
    const braces = [];
    const stack = [];
    let prev = bos;
    let value;
    const eos = () => state.index === len - 1;
    const peek = state.peek = (n = 1) => input[state.index + n];
    const advance = state.advance = () => input[++state.index] || "";
    const remaining = () => input.slice(state.index + 1);
    const consume = (value2 = "", num = 0) => {
      state.consumed += value2;
      state.index += num;
    };
    const append = (token) => {
      state.output += token.output != null ? token.output : token.value;
      consume(token.value);
    };
    const negate = () => {
      let count = 1;
      while (peek() === "!" && (peek(2) !== "(" || peek(3) === "?")) {
        advance();
        state.start++;
        count++;
      }
      if (count % 2 === 0) {
        return false;
      }
      state.negated = true;
      state.start++;
      return true;
    };
    const increment = (type) => {
      state[type]++;
      stack.push(type);
    };
    const decrement = (type) => {
      state[type]--;
      stack.pop();
    };
    const push = (tok) => {
      if (prev.type === "globstar") {
        const isBrace = state.braces > 0 && (tok.type === "comma" || tok.type === "brace");
        const isExtglob = tok.extglob === true || extglobs.length && (tok.type === "pipe" || tok.type === "paren");
        if (tok.type !== "slash" && tok.type !== "paren" && !isBrace && !isExtglob) {
          state.output = state.output.slice(0, -prev.output.length);
          prev.type = "star";
          prev.value = "*";
          prev.output = star;
          state.output += prev.output;
        }
      }
      if (extglobs.length && tok.type !== "paren") {
        extglobs[extglobs.length - 1].inner += tok.value;
      }
      if (tok.value || tok.output)
        append(tok);
      if (prev && prev.type === "text" && tok.type === "text") {
        prev.output = (prev.output || prev.value) + tok.value;
        prev.value += tok.value;
        return;
      }
      tok.prev = prev;
      tokens.push(tok);
      prev = tok;
    };
    const extglobOpen = (type, value2) => {
      const token = { ...EXTGLOB_CHARS[value2], conditions: 1, inner: "" };
      token.prev = prev;
      token.parens = state.parens;
      token.output = state.output;
      token.startIndex = state.index;
      token.tokensIndex = tokens.length;
      const output = (opts.capture ? "(" : "") + token.open;
      increment("parens");
      push({ type, value: value2, output: state.output ? "" : ONE_CHAR });
      push({ type: "paren", extglob: true, value: advance(), output });
      extglobs.push(token);
    };
    const extglobClose = (token) => {
      const literal = input.slice(token.startIndex, state.index + 1);
      const body = input.slice(token.startIndex + 2, state.index);
      const analysis = analyzeRepeatedExtglob(body, opts);
      if ((token.type === "plus" || token.type === "star") && analysis.risky) {
        const safeOutput = analysis.safeOutput ? (token.output ? "" : ONE_CHAR) + (opts.capture ? `(${analysis.safeOutput})` : analysis.safeOutput) : undefined;
        const open = tokens[token.tokensIndex];
        open.type = "text";
        open.value = literal;
        open.output = safeOutput || utils.escapeRegex(literal);
        for (let i = token.tokensIndex + 1;i < tokens.length; i++) {
          tokens[i].value = "";
          tokens[i].output = "";
          delete tokens[i].suffix;
        }
        state.output = token.output + open.output;
        state.backtrack = true;
        push({ type: "paren", extglob: true, value, output: "" });
        decrement("parens");
        return;
      }
      let output = token.close + (opts.capture ? ")" : "");
      let rest;
      if (token.type === "negate") {
        let extglobStar = star;
        if (token.inner && token.inner.length > 1 && token.inner.includes("/")) {
          extglobStar = globstar(opts);
        }
        if (extglobStar !== star || eos() || /^\)+$/.test(remaining())) {
          output = token.close = `)$))${extglobStar}`;
        }
        if (token.inner.includes("*") && (rest = remaining()) && /^\.[^\\/.]+$/.test(rest)) {
          const expression = parse(rest, { ...options, fastpaths: false }).output;
          output = token.close = `)${expression})${extglobStar})`;
        }
        if (token.prev.type === "bos") {
          state.negatedExtglob = true;
        }
      }
      push({ type: "paren", extglob: true, value, output });
      decrement("parens");
    };
    if (opts.fastpaths !== false && !/(^[*!]|[/()[\]{}"])/.test(input)) {
      let backslashes = false;
      let output = input.replace(REGEX_SPECIAL_CHARS_BACKREF, (m, esc, chars, first, rest, index) => {
        if (first === "\\") {
          backslashes = true;
          return m;
        }
        if (first === "?") {
          if (esc) {
            return esc + first + (rest ? QMARK.repeat(rest.length) : "");
          }
          if (index === 0) {
            return qmarkNoDot + (rest ? QMARK.repeat(rest.length) : "");
          }
          return QMARK.repeat(chars.length);
        }
        if (first === ".") {
          return DOT_LITERAL.repeat(chars.length);
        }
        if (first === "*") {
          if (esc) {
            return esc + first + (rest ? star : "");
          }
          return star;
        }
        return esc ? m : `\\${m}`;
      });
      if (backslashes === true) {
        if (opts.unescape === true) {
          output = output.replace(/\\/g, "");
        } else {
          output = output.replace(/\\+/g, (m) => {
            return m.length % 2 === 0 ? "\\\\" : m ? "\\" : "";
          });
        }
      }
      if (output === input && opts.contains === true) {
        state.output = input;
        return state;
      }
      state.output = utils.wrapOutput(output, state, options);
      return state;
    }
    while (!eos()) {
      value = advance();
      if (value === "\x00") {
        continue;
      }
      if (value === "\\") {
        const next = peek();
        if (next === "/" && opts.bash !== true) {
          continue;
        }
        if (next === "." || next === ";") {
          continue;
        }
        if (!next) {
          value += "\\";
          push({ type: "text", value });
          continue;
        }
        const match = /^\\+/.exec(remaining());
        let slashes = 0;
        if (match && match[0].length > 2) {
          slashes = match[0].length;
          state.index += slashes;
          if (slashes % 2 !== 0) {
            value += "\\";
          }
        }
        if (opts.unescape === true) {
          value = advance();
        } else {
          value += advance();
        }
        if (state.brackets === 0) {
          push({ type: "text", value });
          continue;
        }
      }
      if (state.brackets > 0 && (value !== "]" || prev.value === "[" || prev.value === "[^")) {
        if (opts.posix !== false && value === ":") {
          const inner = prev.value.slice(1);
          if (inner.includes("[")) {
            prev.posix = true;
            if (inner.includes(":")) {
              const idx = prev.value.lastIndexOf("[");
              const pre = prev.value.slice(0, idx);
              const rest2 = prev.value.slice(idx + 2);
              const posix = POSIX_REGEX_SOURCE[rest2];
              if (posix) {
                prev.value = pre + posix;
                state.backtrack = true;
                advance();
                if (!bos.output && tokens.indexOf(prev) === 1) {
                  bos.output = ONE_CHAR;
                }
                continue;
              }
            }
          }
        }
        if (value === "[" && peek() !== ":" || value === "-" && peek() === "]") {
          value = `\\${value}`;
        }
        if (value === "]" && (prev.value === "[" || prev.value === "[^")) {
          value = `\\${value}`;
        }
        if (opts.posix === true && value === "!" && prev.value === "[") {
          value = "^";
        }
        prev.value += value;
        append({ value });
        continue;
      }
      if (state.quotes === 1 && value !== '"') {
        value = utils.escapeRegex(value);
        prev.value += value;
        append({ value });
        continue;
      }
      if (value === '"') {
        state.quotes = state.quotes === 1 ? 0 : 1;
        if (opts.keepQuotes === true) {
          push({ type: "text", value });
        }
        continue;
      }
      if (value === "(") {
        increment("parens");
        push({ type: "paren", value });
        continue;
      }
      if (value === ")") {
        if (state.parens === 0 && opts.strictBrackets === true) {
          throw new SyntaxError(syntaxError("opening", "("));
        }
        const extglob = extglobs[extglobs.length - 1];
        if (extglob && state.parens === extglob.parens + 1) {
          extglobClose(extglobs.pop());
          continue;
        }
        push({ type: "paren", value, output: state.parens ? ")" : "\\)" });
        decrement("parens");
        continue;
      }
      if (value === "[") {
        if (opts.nobracket === true || !remaining().includes("]")) {
          if (opts.nobracket !== true && opts.strictBrackets === true) {
            throw new SyntaxError(syntaxError("closing", "]"));
          }
          value = `\\${value}`;
        } else {
          increment("brackets");
        }
        push({ type: "bracket", value });
        continue;
      }
      if (value === "]") {
        if (opts.nobracket === true || prev && prev.type === "bracket" && prev.value.length === 1) {
          push({ type: "text", value, output: `\\${value}` });
          continue;
        }
        if (state.brackets === 0) {
          if (opts.strictBrackets === true) {
            throw new SyntaxError(syntaxError("opening", "["));
          }
          push({ type: "text", value, output: `\\${value}` });
          continue;
        }
        decrement("brackets");
        const prevValue = prev.value.slice(1);
        if (prev.posix !== true && prevValue[0] === "^" && !prevValue.includes("/")) {
          value = `/${value}`;
        }
        prev.value += value;
        append({ value });
        if (opts.literalBrackets === false || utils.hasRegexChars(prevValue)) {
          continue;
        }
        const escaped = utils.escapeRegex(prev.value);
        state.output = state.output.slice(0, -prev.value.length);
        if (opts.literalBrackets === true) {
          state.output += escaped;
          prev.value = escaped;
          continue;
        }
        prev.value = `(${capture}${escaped}|${prev.value})`;
        state.output += prev.value;
        continue;
      }
      if (value === "{" && opts.nobrace !== true) {
        increment("braces");
        const open = {
          type: "brace",
          value,
          output: "(",
          outputIndex: state.output.length,
          tokensIndex: state.tokens.length
        };
        braces.push(open);
        push(open);
        continue;
      }
      if (value === "}") {
        const brace = braces[braces.length - 1];
        if (opts.nobrace === true || !brace) {
          push({ type: "text", value, output: value });
          continue;
        }
        let output = ")";
        if (brace.dots === true) {
          const arr = tokens.slice();
          const range = [];
          for (let i = arr.length - 1;i >= 0; i--) {
            tokens.pop();
            if (arr[i].type === "brace") {
              break;
            }
            if (arr[i].type !== "dots") {
              range.unshift(arr[i].value);
            }
          }
          output = expandRange(range, opts);
          state.backtrack = true;
        }
        if (brace.comma !== true && brace.dots !== true) {
          const out = state.output.slice(0, brace.outputIndex);
          const toks = state.tokens.slice(brace.tokensIndex);
          brace.value = brace.output = "\\{";
          value = output = "\\}";
          state.output = out;
          for (const t of toks) {
            state.output += t.output || t.value;
          }
        }
        push({ type: "brace", value, output });
        decrement("braces");
        braces.pop();
        continue;
      }
      if (value === "|") {
        if (extglobs.length > 0) {
          extglobs[extglobs.length - 1].conditions++;
        }
        push({ type: "text", value });
        continue;
      }
      if (value === ",") {
        let output = value;
        const brace = braces[braces.length - 1];
        if (brace && stack[stack.length - 1] === "braces") {
          brace.comma = true;
          output = "|";
        }
        push({ type: "comma", value, output });
        continue;
      }
      if (value === "/") {
        if (prev.type === "dot" && state.index === state.start + 1) {
          state.start = state.index + 1;
          state.consumed = "";
          state.output = "";
          tokens.pop();
          prev = bos;
          continue;
        }
        push({ type: "slash", value, output: SLASH_LITERAL });
        continue;
      }
      if (value === ".") {
        if (state.braces > 0 && prev.type === "dot") {
          if (prev.value === ".")
            prev.output = DOT_LITERAL;
          const brace = braces[braces.length - 1];
          prev.type = "dots";
          prev.output += value;
          prev.value += value;
          brace.dots = true;
          continue;
        }
        if (state.braces + state.parens === 0 && prev.type !== "bos" && prev.type !== "slash") {
          push({ type: "text", value, output: DOT_LITERAL });
          continue;
        }
        push({ type: "dot", value, output: DOT_LITERAL });
        continue;
      }
      if (value === "?") {
        const isGroup = prev && prev.value === "(";
        if (!isGroup && opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
          extglobOpen("qmark", value);
          continue;
        }
        if (prev && prev.type === "paren") {
          const next = peek();
          let output = value;
          if (prev.value === "(" && !/[!=<:]/.test(next) || next === "<" && !/<([!=]|\w+>)/.test(remaining())) {
            output = `\\${value}`;
          }
          push({ type: "text", value, output });
          continue;
        }
        if (opts.dot !== true && (prev.type === "slash" || prev.type === "bos")) {
          push({ type: "qmark", value, output: QMARK_NO_DOT });
          continue;
        }
        push({ type: "qmark", value, output: QMARK });
        continue;
      }
      if (value === "!") {
        if (opts.noextglob !== true && peek() === "(") {
          if (peek(2) !== "?" || !/[!=<:]/.test(peek(3))) {
            extglobOpen("negate", value);
            continue;
          }
        }
        if (opts.nonegate !== true && state.index === 0) {
          negate();
          continue;
        }
      }
      if (value === "+") {
        if (opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
          extglobOpen("plus", value);
          continue;
        }
        if (prev && prev.value === "(" || opts.regex === false) {
          push({ type: "plus", value, output: PLUS_LITERAL });
          continue;
        }
        if (prev && (prev.type === "bracket" || prev.type === "paren" || prev.type === "brace") || state.parens > 0) {
          push({ type: "plus", value });
          continue;
        }
        push({ type: "plus", value: PLUS_LITERAL });
        continue;
      }
      if (value === "@") {
        if (opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
          push({ type: "at", extglob: true, value, output: "" });
          continue;
        }
        push({ type: "text", value });
        continue;
      }
      if (value !== "*") {
        if (value === "$" || value === "^") {
          value = `\\${value}`;
        }
        const match = REGEX_NON_SPECIAL_CHARS.exec(remaining());
        if (match) {
          value += match[0];
          state.index += match[0].length;
        }
        push({ type: "text", value });
        continue;
      }
      if (prev && (prev.type === "globstar" || prev.star === true)) {
        prev.type = "star";
        prev.star = true;
        prev.value += value;
        prev.output = star;
        state.backtrack = true;
        state.globstar = true;
        consume(value);
        continue;
      }
      let rest = remaining();
      if (opts.noextglob !== true && /^\([^?]/.test(rest)) {
        extglobOpen("star", value);
        continue;
      }
      if (prev.type === "star") {
        if (opts.noglobstar === true) {
          consume(value);
          continue;
        }
        const prior = prev.prev;
        const before = prior.prev;
        const isStart = prior.type === "slash" || prior.type === "bos";
        const afterStar = before && (before.type === "star" || before.type === "globstar");
        if (opts.bash === true && (!isStart || rest[0] && rest[0] !== "/")) {
          push({ type: "star", value, output: "" });
          continue;
        }
        const isBrace = state.braces > 0 && (prior.type === "comma" || prior.type === "brace");
        const isExtglob = extglobs.length && (prior.type === "pipe" || prior.type === "paren");
        if (!isStart && prior.type !== "paren" && !isBrace && !isExtglob) {
          push({ type: "star", value, output: "" });
          continue;
        }
        while (rest.slice(0, 3) === "/**") {
          const after = input[state.index + 4];
          if (after && after !== "/") {
            break;
          }
          rest = rest.slice(3);
          consume("/**", 3);
        }
        if (prior.type === "bos" && eos()) {
          prev.type = "globstar";
          prev.value += value;
          prev.output = globstar(opts);
          state.output = prev.output;
          state.globstar = true;
          consume(value);
          continue;
        }
        if (prior.type === "slash" && prior.prev.type !== "bos" && !afterStar && eos()) {
          state.output = state.output.slice(0, -(prior.output + prev.output).length);
          prior.output = `(?:${prior.output}`;
          prev.type = "globstar";
          prev.output = globstar(opts) + (opts.strictSlashes ? ")" : "|$)");
          prev.value += value;
          state.globstar = true;
          state.output += prior.output + prev.output;
          consume(value);
          continue;
        }
        if (prior.type === "slash" && prior.prev.type !== "bos" && rest[0] === "/") {
          const end = rest[1] !== undefined ? "|$" : "";
          state.output = state.output.slice(0, -(prior.output + prev.output).length);
          prior.output = `(?:${prior.output}`;
          prev.type = "globstar";
          prev.output = `${globstar(opts)}${SLASH_LITERAL}|${SLASH_LITERAL}${end})`;
          prev.value += value;
          state.output += prior.output + prev.output;
          state.globstar = true;
          consume(value + advance());
          push({ type: "slash", value: "/", output: "" });
          continue;
        }
        if (prior.type === "bos" && rest[0] === "/") {
          prev.type = "globstar";
          prev.value += value;
          prev.output = `(?:^|${SLASH_LITERAL}|${globstar(opts)}${SLASH_LITERAL})`;
          state.output = prev.output;
          state.globstar = true;
          consume(value + advance());
          push({ type: "slash", value: "/", output: "" });
          continue;
        }
        state.output = state.output.slice(0, -prev.output.length);
        prev.type = "globstar";
        prev.output = globstar(opts);
        prev.value += value;
        state.output += prev.output;
        state.globstar = true;
        consume(value);
        continue;
      }
      const token = { type: "star", value, output: star };
      if (opts.bash === true) {
        token.output = ".*?";
        if (prev.type === "bos" || prev.type === "slash") {
          token.output = nodot + token.output;
        }
        push(token);
        continue;
      }
      if (prev && (prev.type === "bracket" || prev.type === "paren") && opts.regex === true) {
        token.output = value;
        push(token);
        continue;
      }
      if (state.index === state.start || prev.type === "slash" || prev.type === "dot") {
        if (prev.type === "dot") {
          state.output += NO_DOT_SLASH;
          prev.output += NO_DOT_SLASH;
        } else if (opts.dot === true) {
          state.output += NO_DOTS_SLASH;
          prev.output += NO_DOTS_SLASH;
        } else {
          state.output += nodot;
          prev.output += nodot;
        }
        if (peek() !== "*") {
          state.output += ONE_CHAR;
          prev.output += ONE_CHAR;
        }
      }
      push(token);
    }
    while (state.brackets > 0) {
      if (opts.strictBrackets === true)
        throw new SyntaxError(syntaxError("closing", "]"));
      state.output = utils.escapeLast(state.output, "[");
      decrement("brackets");
    }
    while (state.parens > 0) {
      if (opts.strictBrackets === true)
        throw new SyntaxError(syntaxError("closing", ")"));
      state.output = utils.escapeLast(state.output, "(");
      decrement("parens");
    }
    while (state.braces > 0) {
      if (opts.strictBrackets === true)
        throw new SyntaxError(syntaxError("closing", "}"));
      state.output = utils.escapeLast(state.output, "{");
      decrement("braces");
    }
    if (opts.strictSlashes !== true && (prev.type === "star" || prev.type === "bracket")) {
      push({ type: "maybe_slash", value: "", output: `${SLASH_LITERAL}?` });
    }
    if (state.backtrack === true) {
      state.output = "";
      for (const token of state.tokens) {
        state.output += token.output != null ? token.output : token.value;
        if (token.suffix) {
          state.output += token.suffix;
        }
      }
    }
    return state;
  };
  parse.fastpaths = (input, options) => {
    const opts = { ...options };
    const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
    const len = input.length;
    if (len > max) {
      throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
    }
    input = REPLACEMENTS[input] || input;
    const {
      DOT_LITERAL,
      SLASH_LITERAL,
      ONE_CHAR,
      DOTS_SLASH,
      NO_DOT,
      NO_DOTS,
      NO_DOTS_SLASH,
      STAR,
      START_ANCHOR
    } = constants.globChars(opts.windows);
    const nodot = opts.dot ? NO_DOTS : NO_DOT;
    const slashDot = opts.dot ? NO_DOTS_SLASH : NO_DOT;
    const capture = opts.capture ? "" : "?:";
    const state = { negated: false, prefix: "" };
    let star = opts.bash === true ? ".*?" : STAR;
    if (opts.capture) {
      star = `(${star})`;
    }
    const globstar = (opts2) => {
      if (opts2.noglobstar === true)
        return star;
      return `(${capture}(?:(?!${START_ANCHOR}${opts2.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
    };
    const create = (str) => {
      switch (str) {
        case "*":
          return `${nodot}${ONE_CHAR}${star}`;
        case ".*":
          return `${DOT_LITERAL}${ONE_CHAR}${star}`;
        case "*.*":
          return `${nodot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
        case "*/*":
          return `${nodot}${star}${SLASH_LITERAL}${ONE_CHAR}${slashDot}${star}`;
        case "**":
          return nodot + globstar(opts);
        case "**/*":
          return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${ONE_CHAR}${star}`;
        case "**/*.*":
          return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
        case "**/.*":
          return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${DOT_LITERAL}${ONE_CHAR}${star}`;
        default: {
          const match = /^(.*?)\.(\w+)$/.exec(str);
          if (!match)
            return;
          const source2 = create(match[1]);
          if (!source2)
            return;
          return source2 + DOT_LITERAL + match[2];
        }
      }
    };
    const output = utils.removePrefix(input, state);
    let source = create(output);
    if (source && opts.strictSlashes !== true) {
      source += `${SLASH_LITERAL}?`;
    }
    return source;
  };
  module.exports = parse;
});

// vendor/omo-standalone/node_modules/.bun/picomatch@4.0.4/node_modules/picomatch/lib/picomatch.js
var require_picomatch = __commonJS((exports, module) => {
  var scan = require_scan();
  var parse = require_parse();
  var utils = require_utils();
  var constants = require_constants();
  var isObject = (val) => val && typeof val === "object" && !Array.isArray(val);
  var picomatch = (glob, options, returnState = false) => {
    if (Array.isArray(glob)) {
      const fns = glob.map((input) => picomatch(input, options, returnState));
      const arrayMatcher = (str) => {
        for (const isMatch of fns) {
          const state2 = isMatch(str);
          if (state2)
            return state2;
        }
        return false;
      };
      return arrayMatcher;
    }
    const isState = isObject(glob) && glob.tokens && glob.input;
    if (glob === "" || typeof glob !== "string" && !isState) {
      throw new TypeError("Expected pattern to be a non-empty string");
    }
    const opts = options || {};
    const posix = opts.windows;
    const regex = isState ? picomatch.compileRe(glob, options) : picomatch.makeRe(glob, options, false, true);
    const state = regex.state;
    delete regex.state;
    let isIgnored = () => false;
    if (opts.ignore) {
      const ignoreOpts = { ...options, ignore: null, onMatch: null, onResult: null };
      isIgnored = picomatch(opts.ignore, ignoreOpts, returnState);
    }
    const matcher = (input, returnObject = false) => {
      const { isMatch, match, output } = picomatch.test(input, regex, options, { glob, posix });
      const result = { glob, state, regex, posix, input, output, match, isMatch };
      if (typeof opts.onResult === "function") {
        opts.onResult(result);
      }
      if (isMatch === false) {
        result.isMatch = false;
        return returnObject ? result : false;
      }
      if (isIgnored(input)) {
        if (typeof opts.onIgnore === "function") {
          opts.onIgnore(result);
        }
        result.isMatch = false;
        return returnObject ? result : false;
      }
      if (typeof opts.onMatch === "function") {
        opts.onMatch(result);
      }
      return returnObject ? result : true;
    };
    if (returnState) {
      matcher.state = state;
    }
    return matcher;
  };
  picomatch.test = (input, regex, options, { glob, posix } = {}) => {
    if (typeof input !== "string") {
      throw new TypeError("Expected input to be a string");
    }
    if (input === "") {
      return { isMatch: false, output: "" };
    }
    const opts = options || {};
    const format = opts.format || (posix ? utils.toPosixSlashes : null);
    let match = input === glob;
    let output = match && format ? format(input) : input;
    if (match === false) {
      output = format ? format(input) : input;
      match = output === glob;
    }
    if (match === false || opts.capture === true) {
      if (opts.matchBase === true || opts.basename === true) {
        match = picomatch.matchBase(input, regex, options, posix);
      } else {
        match = regex.exec(output);
      }
    }
    return { isMatch: Boolean(match), match, output };
  };
  picomatch.matchBase = (input, glob, options) => {
    const regex = glob instanceof RegExp ? glob : picomatch.makeRe(glob, options);
    return regex.test(utils.basename(input));
  };
  picomatch.isMatch = (str, patterns, options) => picomatch(patterns, options)(str);
  picomatch.parse = (pattern, options) => {
    if (Array.isArray(pattern))
      return pattern.map((p) => picomatch.parse(p, options));
    return parse(pattern, { ...options, fastpaths: false });
  };
  picomatch.scan = (input, options) => scan(input, options);
  picomatch.compileRe = (state, options, returnOutput = false, returnState = false) => {
    if (returnOutput === true) {
      return state.output;
    }
    const opts = options || {};
    const prepend = opts.contains ? "" : "^";
    const append = opts.contains ? "" : "$";
    let source = `${prepend}(?:${state.output})${append}`;
    if (state && state.negated === true) {
      source = `^(?!${source}).*$`;
    }
    const regex = picomatch.toRegex(source, options);
    if (returnState === true) {
      regex.state = state;
    }
    return regex;
  };
  picomatch.makeRe = (input, options = {}, returnOutput = false, returnState = false) => {
    if (!input || typeof input !== "string") {
      throw new TypeError("Expected a non-empty string");
    }
    let parsed = { negated: false, fastpaths: true };
    if (options.fastpaths !== false && (input[0] === "." || input[0] === "*")) {
      parsed.output = parse.fastpaths(input, options);
    }
    if (!parsed.output) {
      parsed = parse(input, options);
    }
    return picomatch.compileRe(parsed, options, returnOutput, returnState);
  };
  picomatch.toRegex = (source, options) => {
    try {
      const opts = options || {};
      return new RegExp(source, opts.flags || (opts.nocase ? "i" : ""));
    } catch (err) {
      if (options && options.debug === true)
        throw err;
      return /$^/;
    }
  };
  picomatch.constants = constants;
  module.exports = picomatch;
});

// vendor/omo-standalone/node_modules/.bun/picomatch@4.0.4/node_modules/picomatch/index.js
var require_picomatch2 = __commonJS((exports, module) => {
  var pico = require_picomatch();
  var utils = require_utils();
  function picomatch(glob, options, returnState = false) {
    if (options && (options.windows === null || options.windows === undefined)) {
      options = { ...options, windows: utils.isWindows() };
    }
    return pico(glob, options, returnState);
  }
  Object.assign(picomatch, pico);
  module.exports = picomatch;
});

// vendor/omo-standalone/packages/rules-engine/src/cache.ts
function createRuleScanCache() {
  const candidateCache = new Map;
  const directoryCache = new Map;
  return {
    get: (key) => candidateCache.get(key),
    set: (key, value) => candidateCache.set(key, value),
    getDirScan: (dir) => directoryCache.get(dir),
    setDirScan: (dir, entries) => directoryCache.set(dir, entries),
    stats: () => ({ candidateEntries: candidateCache.size, directoryEntries: directoryCache.size }),
    clear: () => {
      candidateCache.clear();
      directoryCache.clear();
    }
  };
}
function createAgentsMdCache() {
  const cache = new Map;
  return {
    get: (key) => cache.get(key),
    set: (key, value) => cache.set(key, value),
    clear: () => cache.clear()
  };
}
// vendor/omo-standalone/packages/rules-engine/src/agents-md.ts
import { existsSync, statSync } from "fs";
import { dirname, isAbsolute, join, relative, resolve } from "path";

// vendor/omo-standalone/packages/rules-engine/src/constants.ts
var PROJECT_MARKERS = [".git", "pyproject.toml", "package.json", "Cargo.toml", "go.mod", ".venv"];
var PROJECT_RULE_SUBDIRS = [
  [".omo", "rules"],
  [".claude", "rules"],
  [".cursor", "rules"],
  [".github", "instructions"],
  [".sisyphus", "rules"]
];
var PROJECT_RULE_FILES = [".github/copilot-instructions.md"];
var OPENCODE_USER_RULE_DIRS = [".omo/rules", ".opencode/rules", ".sisyphus/rules"];
var USER_RULE_DIR = ".claude/rules";
var RULE_EXTENSIONS = [".md", ".mdc"];
var GITHUB_INSTRUCTIONS_PATTERN = /\.instructions\.md$/;
var AGENTS_FILENAME = "AGENTS.md";
var GLOBAL_DISTANCE = 9999;
var EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".turbo", ".next", "coverage"]);
var SOURCE_PRIORITY = new Map([
  [".omo/rules", 0],
  [".claude/rules", 1],
  [".cursor/rules", 2],
  [".github/instructions", 3],
  [".github/copilot-instructions.md", 4],
  [".sisyphus/rules", 5],
  ["~/.omo/rules", 100],
  ["~/.opencode/rules", 101],
  ["~/.claude/rules", 102],
  ["~/.sisyphus/rules", 103]
]);

// vendor/omo-standalone/packages/rules-engine/src/agents-md.ts
async function findAgentsMdUp(input) {
  const startDir = resolve(input.startDir);
  const rootDir = resolve(input.rootDir);
  const skipRoot = input.skipRoot ?? true;
  const cacheKey = [startDir, rootDir, skipRoot ? "1" : "0"].join("\x00");
  const cached = input.cache?.get(cacheKey);
  if (cached)
    return [...cached];
  const found = [];
  let current = startDir;
  while (true) {
    const isRootDir = current === rootDir;
    if (!(skipRoot && isRootDir)) {
      const agentsPath = join(current, AGENTS_FILENAME);
      if (isFile(agentsPath))
        found.push(agentsPath);
    }
    if (isRootDir)
      break;
    const parent = dirname(current);
    if (parent === current || !isSameOrChildPath(parent, rootDir))
      break;
    current = parent;
  }
  const result = found.reverse();
  input.cache?.set(cacheKey, result);
  return result;
}
function isFile(path) {
  if (!existsSync(path))
    return false;
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
function isSameOrChildPath(childPath, parentPath) {
  const relativePath = relative(parentPath, childPath);
  return relativePath === "" || !relativePath.startsWith("..") && !isAbsolute(relativePath);
}
// vendor/omo-standalone/packages/rules-engine/src/finder.ts
import { existsSync as existsSync3, statSync as statSync2 } from "fs";
import { homedir } from "os";
import { dirname as dirname2, isAbsolute as isAbsolute3, join as join3, relative as relative3, resolve as resolve2 } from "path";

// vendor/omo-standalone/packages/rules-engine/src/ordering.ts
function sortCandidates(candidates) {
  return candidates.map((candidate, index) => ({ candidate, index })).sort((left, right) => compareCandidates(left.candidate, right.candidate) || left.index - right.index).map(({ candidate }) => candidate);
}
function compareCandidates(left, right) {
  return Number(left.isGlobal) - Number(right.isGlobal) || left.distance - right.distance || (SOURCE_PRIORITY.get(left.source) ?? Number.POSITIVE_INFINITY) - (SOURCE_PRIORITY.get(right.source) ?? Number.POSITIVE_INFINITY) || compareString(left.relativePath, right.relativePath) || compareString(left.realPath, right.realPath);
}
function compareString(left, right) {
  if (left < right)
    return -1;
  if (left > right)
    return 1;
  return 0;
}

// vendor/omo-standalone/packages/rules-engine/src/scanner.ts
import { existsSync as existsSync2, readdirSync, realpathSync } from "fs";
import { isAbsolute as isAbsolute2, join as join2, relative as relative2 } from "path";
function isGitHubInstructionsDir(dir) {
  return dir.includes(".github/instructions") || dir.endsWith(".github/instructions");
}
function isRuleFile(fileName, dir) {
  if (isGitHubInstructionsDir(dir))
    return GITHUB_INSTRUCTIONS_PATTERN.test(fileName);
  return RULE_EXTENSIONS.some((extension) => fileName.endsWith(extension));
}
function safeRealpathSync(filePath) {
  try {
    return realpathSync.native(filePath);
  } catch {
    return filePath;
  }
}
function isPathWithinRoot(candidate, root) {
  const rel = relative2(root, candidate);
  return rel === "" || !rel.startsWith("..") && !isAbsolute2(rel);
}
function findRuleFilesRecursive(dir, results, visited = new Set, boundaryRoot) {
  if (!existsSync2(dir))
    return;
  const realDir = safeRealpathSync(dir);
  const effectiveBoundary = boundaryRoot ?? realDir;
  if (!isPathWithinRoot(realDir, effectiveBoundary))
    return;
  if (visited.has(realDir))
    return;
  visited.add(realDir);
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true, encoding: "utf8" }).sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = join2(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name))
        findRuleFilesRecursive(fullPath, results, visited, effectiveBoundary);
      continue;
    }
    if (entry.isFile() && isRuleFile(entry.name, dir)) {
      const realPath = safeRealpathSync(fullPath);
      if (!isPathWithinRoot(realPath, effectiveBoundary))
        continue;
      results.push({ path: fullPath, realPath, relativePath: entry.name });
    }
  }
}

// vendor/omo-standalone/packages/rules-engine/src/finder.ts
var noopSisyphusRuleDeprecationLogger = () => {};
var SISYPHUS_DEPRECATION_MESSAGE = "[rules] .sisyphus/rules is deprecated and will be removed in v4.3.0; migrate to .omo/rules";
var SISYPHUS_LEGACY_RULE_SOURCES = new Set([".sisyphus/rules", "~/.sisyphus/rules"]);
var warnedSisyphusRuleDirectories = new Set;
var logSisyphusRuleDeprecation = noopSisyphusRuleDeprecationLogger;
function setSisyphusRuleDeprecationLogger(logger) {
  logSisyphusRuleDeprecation = logger;
}
function findRuleFiles(projectRoot, homeDir, currentFile, options, cache) {
  const startDir = dirname2(resolve2(currentFile));
  const skipClaudeUserRules = options?.skipClaudeUserRules ?? false;
  const effectiveProjectRoot = resolveEffectiveProjectRoot(projectRoot, options?.workspaceDirectory, startDir);
  const cacheKey = [projectRoot ?? "", effectiveProjectRoot, startDir, skipClaudeUserRules ? "1" : "0"].join("\x00");
  const cached = cache?.get(cacheKey);
  if (cached)
    return [...cached];
  const candidates = [];
  const seenRealPaths = new Set;
  addProjectRuleCandidates(effectiveProjectRoot, startDir, candidates, seenRealPaths, cache);
  addProjectSingleFileCandidates(effectiveProjectRoot, candidates, seenRealPaths);
  addUserRuleCandidates(homeDir || homedir(), skipClaudeUserRules, candidates, seenRealPaths, cache);
  const sorted = sortCandidates(candidates);
  cache?.set(cacheKey, sorted);
  return sorted;
}
function resolveEffectiveProjectRoot(projectRoot, workspaceDirectory, startDir) {
  if (projectRoot)
    return projectRoot;
  if (!workspaceDirectory)
    return startDir;
  const workspaceRoot = resolve2(workspaceDirectory);
  return isSameOrChildPath2(startDir, workspaceRoot) ? workspaceRoot : startDir;
}
function addProjectRuleCandidates(projectRoot, startDir, candidates, seenRealPaths, cache) {
  const projectRootRealPath = safeRealpathSync(projectRoot);
  let currentDir = startDir;
  let distance = 0;
  while (true) {
    for (const [parent, subdir] of PROJECT_RULE_SUBDIRS) {
      const source = `${parent}/${subdir}`;
      const ruleDir = join3(currentDir, parent, subdir);
      for (const entry of scanDirectoryWithCache(ruleDir, cache, projectRootRealPath)) {
        if (seenRealPaths.has(entry.realPath))
          continue;
        seenRealPaths.add(entry.realPath);
        warnSisyphusRuleDeprecation(source, entry.path);
        candidates.push({
          path: entry.path,
          realPath: entry.realPath,
          source,
          isGlobal: false,
          distance,
          relativePath: normalizePath(relative3(projectRoot, entry.path))
        });
      }
    }
    if (currentDir === projectRoot)
      break;
    const parentDir = dirname2(currentDir);
    if (parentDir === currentDir || !isSameOrChildPath2(parentDir, projectRoot))
      break;
    currentDir = parentDir;
    distance += 1;
  }
}
function addProjectSingleFileCandidates(projectRoot, candidates, seenRealPaths) {
  const projectRootRealPath = safeRealpathSync(projectRoot);
  for (const ruleFile of PROJECT_RULE_FILES) {
    const filePath = join3(projectRoot, ruleFile);
    const realPath = validFileRealPath(filePath, projectRootRealPath);
    if (realPath === null || seenRealPaths.has(realPath))
      continue;
    seenRealPaths.add(realPath);
    candidates.push({
      path: filePath,
      realPath,
      source: ruleFile,
      isGlobal: false,
      distance: 0,
      isSingleFile: true,
      relativePath: normalizePath(ruleFile)
    });
  }
}
function addUserRuleCandidates(homeDir, skipClaudeUserRules, candidates, seenRealPaths, cache) {
  const userRuleDirs = OPENCODE_USER_RULE_DIRS.map((dir) => [join3(homeDir, dir), `~/${dir}`]);
  if (!skipClaudeUserRules)
    userRuleDirs.push([join3(homeDir, USER_RULE_DIR), "~/.claude/rules"]);
  for (const [userRuleDir, source] of userRuleDirs) {
    for (const entry of scanDirectoryWithCache(userRuleDir, cache)) {
      if (seenRealPaths.has(entry.realPath))
        continue;
      seenRealPaths.add(entry.realPath);
      warnSisyphusRuleDeprecation(source, entry.path);
      candidates.push({
        path: entry.path,
        realPath: entry.realPath,
        source,
        isGlobal: true,
        distance: GLOBAL_DISTANCE,
        relativePath: normalizePath(relative3(homeDir, entry.path))
      });
    }
  }
}
function scanDirectoryWithCache(dir, cache, boundaryRealPath) {
  const cached = cache?.getDirScan(dir);
  if (cached)
    return cached;
  const entries = [];
  findRuleFilesRecursive(dir, entries, new Set, boundaryRealPath);
  cache?.setDirScan(dir, entries);
  return entries;
}
function warnSisyphusRuleDeprecation(source, path) {
  if (!SISYPHUS_LEGACY_RULE_SOURCES.has(source))
    return;
  const warningKey = dirname2(path);
  if (warnedSisyphusRuleDirectories.has(warningKey))
    return;
  warnedSisyphusRuleDirectories.add(warningKey);
  logSisyphusRuleDeprecation(SISYPHUS_DEPRECATION_MESSAGE, {
    event: "rules-sisyphus-deprecated",
    path
  });
}
function validFileRealPath(filePath, boundaryRealPath) {
  if (!existsSync3(filePath))
    return null;
  try {
    if (!statSync2(filePath).isFile())
      return null;
    const realPath = safeRealpathSync(filePath);
    if (boundaryRealPath !== undefined && !isSameOrChildPath2(realPath, boundaryRealPath))
      return null;
    return realPath;
  } catch {
    return null;
  }
}
function isSameOrChildPath2(childPath, parentPath) {
  const relativePath = relative3(parentPath, childPath);
  return relativePath === "" || !relativePath.startsWith("..") && !isAbsolute3(relativePath);
}
function normalizePath(path) {
  return path.replaceAll("\\", "/");
}
// vendor/omo-standalone/packages/rules-engine/src/parser.ts
function parseRuleFrontmatter(content) {
  const normalized = stripBom(content);
  const openingLength = openingDelimiterLength(normalized);
  if (openingLength === 0)
    return { metadata: {}, body: normalized };
  const closing = findClosingDelimiter(normalized, openingLength);
  if (!closing)
    return { metadata: {}, body: normalized };
  try {
    return { metadata: parseYaml(normalized.slice(openingLength, closing.start)), body: normalized.slice(closing.bodyStart) };
  } catch {
    return { metadata: {}, body: normalized };
  }
}
function parseYaml(yaml) {
  const lines = yaml.replace(/\r\n/g, `
`).split(`
`);
  const metadata = {};
  let index = 0;
  while (index < lines.length) {
    const line = stripComment(lines[index] ?? "").trim();
    if (!line) {
      index += 1;
      continue;
    }
    const colon = line.indexOf(":");
    if (colon === -1) {
      index += 1;
      continue;
    }
    const key = line.slice(0, colon).trim();
    const rawValue = line.slice(colon + 1).trim();
    if (key === "description")
      metadata.description = parseString(rawValue);
    else if (key === "alwaysApply")
      metadata.alwaysApply = rawValue === "true";
    else if (key === "globs" || key === "paths" || key === "applyTo") {
      const parsed = parseGlobValue(rawValue, lines, index);
      metadata.globs = mergeGlobs(metadata.globs, parsed.value);
      index += parsed.consumed;
      continue;
    }
    index += 1;
  }
  return metadata;
}
function parseGlobValue(rawValue, lines, currentIndex) {
  if (rawValue.startsWith("["))
    return { value: parseInlineArray(rawValue), consumed: 1 };
  if (!rawValue) {
    const parsed = parseMultilineArray(lines, currentIndex);
    return parsed.values.length > 0 ? { value: parsed.values, consumed: parsed.consumed } : { value: "", consumed: 1 };
  }
  const value = parseString(rawValue);
  if (value.includes(","))
    return { value: value.split(",").map((item) => item.trim()).filter(Boolean), consumed: 1 };
  return { value, consumed: 1 };
}
function parseMultilineArray(lines, currentIndex) {
  const values = [];
  let consumed = 1;
  for (let index = currentIndex + 1;index < lines.length; index += 1) {
    const line = stripComment(lines[index] ?? "");
    if (line.trim().length === 0) {
      consumed += 1;
      continue;
    }
    const item = line.match(/^\s+-\s*(.*)$/);
    if (!item)
      break;
    const value = parseString(item[1] ?? "");
    if (value)
      values.push(value);
    consumed += 1;
  }
  return { values, consumed };
}
function parseInlineArray(value) {
  const closing = value.lastIndexOf("]");
  if (closing === -1)
    return [];
  return splitCommaSeparated(value.slice(1, closing)).map(parseString).filter(Boolean);
}
function mergeGlobs(existing, next) {
  if (Array.isArray(next) && next.length === 0)
    return existing ?? [];
  if (!Array.isArray(next) && next.length === 0)
    return existing ?? "";
  if (existing === undefined) {
    if (typeof next === "string")
      return next;
    return [...next];
  }
  const existingValues = Array.isArray(existing) ? existing : [existing];
  const nextValues = typeof next === "string" ? [next] : [...next];
  return [...existingValues, ...nextValues];
}
function splitCommaSeparated(value) {
  const values = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (quote && character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      if (!quote)
        quote = character;
      else if (quote === character)
        quote = null;
      current += character;
      continue;
    }
    if (!quote && character === ",") {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  values.push(current.trim());
  return values;
}
function parseString(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') || trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
function stripComment(line) {
  let quote = null;
  for (let index = 0;index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' || character === "'") {
      if (!quote)
        quote = character;
      else if (quote === character)
        quote = null;
    }
    if (!quote && character === "#")
      return line.slice(0, index);
  }
  return line;
}
function stripBom(content) {
  return content.startsWith("\uFEFF") ? content.slice(1) : content;
}
function openingDelimiterLength(content) {
  if (content.startsWith(`---\r
`))
    return 5;
  if (content.startsWith(`---
`))
    return 4;
  return 0;
}
function findClosingDelimiter(content, openingLength) {
  let lineStart = openingLength;
  while (lineStart <= content.length) {
    const nextNewline = content.indexOf(`
`, lineStart);
    const lineEnd = nextNewline === -1 ? content.length : nextNewline;
    if (content.slice(lineStart, lineEnd).replace(/\r$/, "") === "---") {
      return { start: lineStart, bodyStart: nextNewline === -1 ? content.length : nextNewline + 1 };
    }
    if (nextNewline === -1)
      break;
    lineStart = nextNewline + 1;
  }
  return null;
}
// vendor/omo-standalone/packages/rules-engine/src/matcher.ts
var import_picomatch = __toESM(require_picomatch2(), 1);
import { createHash } from "crypto";
import { basename, relative as relative4 } from "path";
var matcherCache = new Map;
var MAX_MATCHER_CACHE_ENTRIES = 256;
var PICOMATCH_OPTIONS = { dot: true, bash: true };
function resetMatcherCache() {
  matcherCache.clear();
}
function getMatcherCacheStats() {
  return { entries: matcherCache.size };
}
function shouldApplyRule(metadata, currentFilePath, projectRoot) {
  if (metadata.alwaysApply === true)
    return { applies: true, reason: "alwaysApply" };
  const patterns = normalizeGlobs(metadata);
  if (patterns.length === 0)
    return { applies: false };
  const pathBases = [
    toPosix(projectRoot ? relative4(projectRoot, currentFilePath) : currentFilePath),
    toPosix(basename(currentFilePath))
  ];
  const negativeMatchers = patterns.filter((pattern) => pattern.startsWith("!")).map((pattern) => matcherFor(pattern.slice(1)));
  for (const pattern of patterns) {
    if (pattern.startsWith("!"))
      continue;
    const isMatch = matcherFor(pattern);
    if (!pathBases.some((pathBase) => isMatch(pathBase)))
      continue;
    if (pathBases.some((pathBase) => negativeMatchers.some((isExcluded) => isExcluded(pathBase))))
      return { applies: false };
    return { applies: true, reason: `glob: ${pattern}` };
  }
  return { applies: false };
}
function createContentHash(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}
function isDuplicateByRealPath(realPath, cache) {
  return cache.has(realPath);
}
function isDuplicateByContentHash(hash, cache) {
  return cache.has(hash);
}
function normalizeGlobs(metadata) {
  const patterns = [...normalizePatternList(metadata.globs), ...normalizePatternList(metadata.paths), ...normalizePatternList(metadata.applyTo)];
  return [...new Set(patterns.map(toPosix))];
}
function normalizePatternList(patterns) {
  if (patterns === undefined)
    return [];
  return typeof patterns === "string" ? [patterns] : [...patterns];
}
function matcherFor(pattern) {
  const cached = matcherCache.get(pattern);
  if (cached) {
    matcherCache.delete(pattern);
    matcherCache.set(pattern, cached);
    return cached;
  }
  const matcher = import_picomatch.default(pattern, PICOMATCH_OPTIONS);
  if (matcherCache.size >= MAX_MATCHER_CACHE_ENTRIES) {
    const oldest = matcherCache.keys().next().value;
    if (oldest !== undefined)
      matcherCache.delete(oldest);
  }
  matcherCache.set(pattern, matcher);
  return matcher;
}
function toPosix(path) {
  return path.replaceAll("\\", "/");
}
// vendor/omo-standalone/packages/rules-engine/src/project-root.ts
import { existsSync as existsSync4, statSync as statSync3 } from "fs";
import { dirname as dirname3, join as join4 } from "path";
var projectRootCache = new Map;
function clearProjectRootCache() {
  projectRootCache.clear();
}
function findProjectRoot(startPath) {
  const cached = projectRootCache.get(startPath);
  if (cached !== undefined)
    return cached;
  const startDir = resolveStartDir(startPath);
  const cachedStartDir = projectRootCache.get(startDir);
  if (cachedStartDir !== undefined) {
    projectRootCache.set(startPath, cachedStartDir);
    return cachedStartDir;
  }
  const visited = [];
  let current = startDir;
  let resolved = null;
  while (true) {
    const cachedAncestor = projectRootCache.get(current);
    if (cachedAncestor !== undefined) {
      resolved = cachedAncestor;
      break;
    }
    visited.push(current);
    if (hasProjectMarker(current)) {
      resolved = current;
      break;
    }
    const parent = dirname3(current);
    if (parent === current)
      break;
    current = parent;
  }
  for (const directory of visited)
    projectRootCache.set(directory, resolved);
  projectRootCache.set(startPath, resolved);
  return resolved;
}
function resolveStartDir(startPath) {
  try {
    return statSync3(startPath).isDirectory() ? startPath : dirname3(startPath);
  } catch {
    return dirname3(startPath);
  }
}
function hasProjectMarker(directory) {
  return PROJECT_MARKERS.some((marker) => existsSync4(join4(directory, marker)));
}
// vendor/omo-standalone/packages/rules-engine/src/distance.ts
import { dirname as dirname4, relative as relative5 } from "path";
function calculateDistance(rulePath, currentFile, projectRoot) {
  if (!projectRoot)
    return GLOBAL_DISTANCE;
  try {
    const ruleRelative = relative5(projectRoot, dirname4(rulePath));
    const currentRelative = relative5(projectRoot, dirname4(currentFile));
    if (ruleRelative.startsWith("..") || currentRelative.startsWith(".."))
      return GLOBAL_DISTANCE;
    const ruleParts = toParts(ruleRelative);
    const currentParts = toParts(currentRelative);
    let shared = 0;
    for (let index = 0;index < Math.min(ruleParts.length, currentParts.length); index += 1) {
      if (ruleParts[index] !== currentParts[index])
        break;
      shared += 1;
    }
    return currentParts.length - shared;
  } catch {
    return GLOBAL_DISTANCE;
  }
}
function toParts(path) {
  return path.split(/[/\\]/).filter(Boolean);
}
export {
  shouldApplyRule,
  setSisyphusRuleDeprecationLogger,
  safeRealpathSync,
  resetMatcherCache,
  parseRuleFrontmatter,
  isDuplicateByRealPath,
  isDuplicateByContentHash,
  getMatcherCacheStats,
  findRuleFilesRecursive,
  findRuleFiles,
  findProjectRoot,
  findAgentsMdUp,
  createRuleScanCache,
  createContentHash,
  createAgentsMdCache,
  clearProjectRootCache,
  calculateDistance
};

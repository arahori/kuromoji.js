(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.kuromoji = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

var ViterbiBuilder = require("./viterbi/ViterbiBuilder");
var ViterbiSearcher = require("./viterbi/ViterbiSearcher");
var IpadicFormatter = require("./util/IpadicFormatter");

var PUNCTUATION = /、|。/;

/**
 * Tokenizer
 * @param {DynamicDictionaries} dic Dictionaries used by this tokenizer
 * @constructor
 */
function Tokenizer(dic) {
    this.token_info_dictionary = dic.token_info_dictionary;
    this.unknown_dictionary = dic.unknown_dictionary;
    this.viterbi_builder = new ViterbiBuilder(dic);
    this.viterbi_searcher = new ViterbiSearcher(dic.connection_costs);
    this.formatter = new IpadicFormatter();  // TODO Other dictionaries
}

/**
 * Split into sentence by punctuation
 * @param {string} input Input text
 * @returns {Array.<string>} Sentences end with punctuation
 */
Tokenizer.splitByPunctuation = function (input) {
    var sentences = [];
    var tail = input;
    while (true) {
        if (tail === "") {
            break;
        }
        var index = tail.search(PUNCTUATION);
        if (index < 0) {
            sentences.push(tail);
            break;
        }
        sentences.push(tail.substring(0, index + 1));
        tail = tail.substring(index + 1);
    }
    return sentences;
};

/**
 * Tokenize text
 * @param {string} text Input text to analyze
 * @returns {Array} Tokens
 */
Tokenizer.prototype.tokenize = function (text) {
    var sentences = Tokenizer.splitByPunctuation(text);
    var tokens = [];
    for (var i = 0; i < sentences.length; i++) {
        var sentence = sentences[i];
        this.tokenizeForSentence(sentence, tokens);
    }
    return tokens;
};

Tokenizer.prototype.tokenizeForSentence = function (sentence, tokens) {
    if (tokens == null) {
        tokens = [];
    }
    var lattice = this.getLattice(sentence);
    var best_path = this.viterbi_searcher.search(lattice);
    var last_pos = 0;
    if (tokens.length > 0) {
        last_pos = tokens[tokens.length - 1].word_position;
    }

    for (var j = 0; j < best_path.length; j++) {
        var node = best_path[j];

        var token, features, features_line;
        if (node.type === "KNOWN") {
            features_line = this.token_info_dictionary.getFeatures(node.name);
            if (features_line == null) {
                features = [];
            } else {
                features = features_line.split(",");
            }
            token = this.formatter.formatEntry(node.name, last_pos + node.start_pos, node.type, features);
        } else if (node.type === "UNKNOWN") {
            // Unknown word
            features_line = this.unknown_dictionary.getFeatures(node.name);
            if (features_line == null) {
                features = [];
            } else {
                features = features_line.split(",");
            }
            token = this.formatter.formatUnknownEntry(node.name, last_pos + node.start_pos, node.type, features, node.surface_form);
        } else {
            // TODO User dictionary
            token = this.formatter.formatEntry(node.name, last_pos + node.start_pos, node.type, []);
        }

        tokens.push(token);
    }

    return tokens;
};

/**
 * Build word lattice
 * @param {string} text Input text to analyze
 * @returns {ViterbiLattice} Word lattice
 */
Tokenizer.prototype.getLattice = function (text) {
    return this.viterbi_builder.build(text);
};

module.exports = Tokenizer;

},{"./util/IpadicFormatter":17,"./viterbi/ViterbiBuilder":19,"./viterbi/ViterbiSearcher":22}],2:[function(require,module,exports){
/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

var Tokenizer = require("./Tokenizer");
var DictionaryLoader = require("./loader/NodeDictionaryLoader");

/**
 * TokenizerBuilder create Tokenizer instance.
 * @param {Object} option JSON object which have key-value pairs settings
 * @param {string} option.dicPath Dictionary directory path (or URL using in browser)
 * @constructor
 */
function TokenizerBuilder(option) {
    if (option.dicPath == null) {
        this.dic_path = "dict/";
    } else {
        this.dic_path = option.dicPath;
    }
}

/**
 * Build Tokenizer instance by asynchronous manner
 * @param {TokenizerBuilder~onLoad} callback Callback function
 */
TokenizerBuilder.prototype.build = function (callback) {
    var loader = new DictionaryLoader(this.dic_path);
    loader.load(function (err, dic) {
        callback(err, new Tokenizer(dic));
    });
};

/**
 * Callback used by build
 * @callback TokenizerBuilder~onLoad
 * @param {Object} err Error object
 * @param {Tokenizer} tokenizer Prepared Tokenizer
 */

module.exports = TokenizerBuilder;

},{"./Tokenizer":1,"./loader/NodeDictionaryLoader":14}],3:[function(require,module,exports){
/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

/**
 * CharacterClass
 * @param {number} class_id
 * @param {string} class_name
 * @param {boolean} is_always_invoke
 * @param {boolean} is_grouping
 * @param {number} max_length
 * @constructor
 */
function CharacterClass(class_id, class_name, is_always_invoke, is_grouping, max_length) {
    this.class_id = class_id;
    this.class_name = class_name;
    this.is_always_invoke = is_always_invoke;
    this.is_grouping = is_grouping;
    this.max_length = max_length;
}

module.exports = CharacterClass;

},{}],4:[function(require,module,exports){
/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

var InvokeDefinitionMap = require("./InvokeDefinitionMap");
var CharacterClass = require("./CharacterClass");
var SurrogateAwareString = require("../util/SurrogateAwareString");

var DEFAULT_CATEGORY = "DEFAULT";

/**
 * CharacterDefinition represents char.def file and
 * defines behavior of unknown word processing
 * @constructor
 */
function CharacterDefinition() {
    this.character_category_map = new Uint8Array(65536);  // for all UCS2 code points
    this.compatible_category_map = new Uint32Array(65536);  // for all UCS2 code points
    this.invoke_definition_map = null;
}

/**
 * Load CharacterDefinition
 * @param {Uint8Array} cat_map_buffer
 * @param {Uint32Array} compat_cat_map_buffer
 * @param {InvokeDefinitionMap} invoke_def_buffer
 * @returns {CharacterDefinition}
 */
CharacterDefinition.load = function (cat_map_buffer, compat_cat_map_buffer, invoke_def_buffer) {
    var char_def = new CharacterDefinition();
    char_def.character_category_map = cat_map_buffer;
    char_def.compatible_category_map = compat_cat_map_buffer;
    char_def.invoke_definition_map = InvokeDefinitionMap.load(invoke_def_buffer);
    return char_def;
};

CharacterDefinition.parseCharCategory = function (class_id, parsed_category_def) {
    var category = parsed_category_def[1];
    var invoke = parseInt(parsed_category_def[2]);
    var grouping = parseInt(parsed_category_def[3]);
    var max_length = parseInt(parsed_category_def[4]);
    if (!isFinite(invoke) || (invoke !== 0 && invoke !== 1)) {
        console.log("char.def parse error. INVOKE is 0 or 1 in:" + invoke);
        return null;
    }
    if (!isFinite(grouping) || (grouping !== 0 && grouping !== 1)) {
        console.log("char.def parse error. GROUP is 0 or 1 in:" + grouping);
        return null;
    }
    if (!isFinite(max_length) || max_length < 0) {
        console.log("char.def parse error. LENGTH is 1 to n:" + max_length);
        return null;
    }
    var is_invoke = (invoke === 1);
    var is_grouping = (grouping === 1);

    return new CharacterClass(class_id, category, is_invoke, is_grouping, max_length);
};

CharacterDefinition.parseCategoryMapping = function (parsed_category_mapping) {
    var start = parseInt(parsed_category_mapping[1]);
    var default_category = parsed_category_mapping[2];
    var compatible_category = (3 < parsed_category_mapping.length) ? parsed_category_mapping.slice(3) : [];
    if (!isFinite(start) || start < 0 || start > 0xFFFF) {
        console.log("char.def parse error. CODE is invalid:" + start);
    }
    return { start: start, default: default_category, compatible: compatible_category};
};

CharacterDefinition.parseRangeCategoryMapping = function (parsed_category_mapping) {
    var start = parseInt(parsed_category_mapping[1]);
    var end = parseInt(parsed_category_mapping[2]);
    var default_category = parsed_category_mapping[3];
    var compatible_category = (4 < parsed_category_mapping.length) ? parsed_category_mapping.slice(4) : [];
    if (!isFinite(start) || start < 0 || start > 0xFFFF) {
        console.log("char.def parse error. CODE is invalid:" + start);
    }
    if (!isFinite(end) || end < 0 || end > 0xFFFF) {
        console.log("char.def parse error. CODE is invalid:" + end);
    }
    return { start: start, end: end, default: default_category, compatible: compatible_category};
};

/**
 * Initializing method
 * @param {Array} category_mapping Array of category mapping
 */
CharacterDefinition.prototype.initCategoryMappings = function (category_mapping) {
    // Initialize map by DEFAULT class
    var code_point;
    if (category_mapping != null) {
        for (var i = 0; i < category_mapping.length; i++) {
            var mapping = category_mapping[i];
            var end = mapping.end || mapping.start;
            for (code_point = mapping.start; code_point <= end; code_point++) {

                // Default Category class ID
                this.character_category_map[code_point] = this.invoke_definition_map.lookup(mapping.default);

                for (var j = 0; j < mapping.compatible.length; j++) {
                    var bitset = this.compatible_category_map[code_point];
                    var compatible_category = mapping.compatible[j];
                    if (compatible_category == null) {
                        continue;
                    }
                    var class_id = this.invoke_definition_map.lookup(compatible_category);  // Default Category
                    if (class_id == null) {
                        continue;
                    }
                    var class_id_bit = 1 << class_id;
                    bitset = bitset | class_id_bit;  // Set a bit of class ID 例えば、class_idが3のとき、3ビット目に1を立てる
                    this.compatible_category_map[code_point] = bitset;
                }
            }
        }
    }
    var default_id = this.invoke_definition_map.lookup(DEFAULT_CATEGORY);
    if (default_id == null) {
        return;
    }
    for (code_point = 0; code_point < this.character_category_map.length; code_point++) {
        // 他に何のクラスも定義されていなかったときだけ DEFAULT
        if (this.character_category_map[code_point] === 0) {
            // DEFAULT class ID に対応するビットだけ1を立てる
            this.character_category_map[code_point] = 1 << default_id;
        }
    }
};

/**
 * Lookup compatible categories for a character (not included 1st category)
 * @param {string} ch UCS2 character (just 1st character is effective)
 * @returns {Array.<CharacterClass>} character classes
 */
CharacterDefinition.prototype.lookupCompatibleCategory = function (ch) {
    var classes = [];

    /*
     if (SurrogateAwareString.isSurrogatePair(ch)) {
     // Surrogate pair character codes can not be defined by char.def
     return classes;
     }*/
    var code = ch.charCodeAt(0);
    var integer;
    if (code < this.compatible_category_map.length) {
        integer = this.compatible_category_map[code];  // Bitset
    }

    if (integer == null || integer === 0) {
        return classes;
    }

    for (var bit = 0; bit < 32; bit++) {  // Treat "bit" as a class ID
        if (((integer << (31 - bit)) >>> 31) === 1) {
            var character_class = this.invoke_definition_map.getCharacterClass(bit);
            if (character_class == null) {
                continue;
            }
            classes.push(character_class);
        }
    }
    return classes;
};


/**
 * Lookup category for a character
 * @param {string} ch UCS2 character (just 1st character is effective)
 * @returns {CharacterClass} character class
 */
CharacterDefinition.prototype.lookup = function (ch) {

    var class_id;

    var code = ch.charCodeAt(0);
    if (SurrogateAwareString.isSurrogatePair(ch)) {
        // Surrogate pair character codes can not be defined by char.def, so set DEFAULT category
        class_id = this.invoke_definition_map.lookup(DEFAULT_CATEGORY);
    } else if (code < this.character_category_map.length) {
        class_id = this.character_category_map[code];  // Read as integer value
    }

    if (class_id == null) {
        class_id = this.invoke_definition_map.lookup(DEFAULT_CATEGORY);
    }

    return this.invoke_definition_map.getCharacterClass(class_id);
};

module.exports = CharacterDefinition;

},{"../util/SurrogateAwareString":18,"./CharacterClass":3,"./InvokeDefinitionMap":7}],5:[function(require,module,exports){
/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

/**
 * Connection costs matrix from cc.dat file.
 * 2 dimension matrix [forward_id][backward_id] -> cost
 * @constructor
 * @param {number} forward_dimension
 * @param {number} backward_dimension
 */
function ConnectionCosts(forward_dimension, backward_dimension) {
    this.forward_dimension = forward_dimension;
    this.backward_dimension = backward_dimension;

    // leading 2 integers for forward_dimension, backward_dimension, respectively
    this.buffer = new Int16Array(forward_dimension * backward_dimension + 2);
    this.buffer[0] = forward_dimension;
    this.buffer[1] = backward_dimension;
}

ConnectionCosts.prototype.put = function (forward_id, backward_id, cost) {
    var index = forward_id * this.backward_dimension + backward_id + 2;
    if (this.buffer.length < index + 1) {
        throw "ConnectionCosts buffer overflow";
    }
    this.buffer[index] = cost;
};

ConnectionCosts.prototype.get = function (forward_id, backward_id) {
    var index = forward_id * this.backward_dimension + backward_id + 2;
    if (this.buffer.length < index + 1) {
        throw "ConnectionCosts buffer overflow";
    }
    return this.buffer[index];
};

ConnectionCosts.prototype.loadConnectionCosts = function (connection_costs_buffer) {
    this.forward_dimension = connection_costs_buffer[0];
    this.backward_dimension = connection_costs_buffer[1];
    this.buffer = connection_costs_buffer;
};

module.exports = ConnectionCosts;

},{}],6:[function(require,module,exports){
/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

var doublearray = require("doublearray");
var TokenInfoDictionary = require("./TokenInfoDictionary");
var ConnectionCosts = require("./ConnectionCosts");
var UnknownDictionary = require("./UnknownDictionary");

/**
 * Dictionaries container for Tokenizer
 * @param {DoubleArray} trie
 * @param {TokenInfoDictionary} token_info_dictionary
 * @param {ConnectionCosts} connection_costs
 * @param {UnknownDictionary} unknown_dictionary
 * @constructor
 */
function DynamicDictionaries(trie, token_info_dictionary, connection_costs, unknown_dictionary) {
    if (trie != null) {
        this.trie = trie;
    } else {
        this.trie = doublearray.builder(0).build([
            {k: "", v: 1}
        ]);
    }
    if (token_info_dictionary != null) {
        this.token_info_dictionary = token_info_dictionary;
    } else {
        this.token_info_dictionary = new TokenInfoDictionary();
    }
    if (connection_costs != null) {
        this.connection_costs = connection_costs;
    } else {
        // backward_size * backward_size
        this.connection_costs = new ConnectionCosts(0, 0);
    }
    if (unknown_dictionary != null) {
        this.unknown_dictionary = unknown_dictionary;
    } else {
        this.unknown_dictionary = new UnknownDictionary();
    }
}

// from base.dat & check.dat
DynamicDictionaries.prototype.loadTrie = function (base_buffer, check_buffer) {
    this.trie = doublearray.load(base_buffer, check_buffer);
    return this;
};

DynamicDictionaries.prototype.loadTokenInfoDictionaries = function (token_info_buffer, pos_buffer, target_map_buffer) {
    this.token_info_dictionary.loadDictionary(token_info_buffer);
    this.token_info_dictionary.loadPosVector(pos_buffer);
    this.token_info_dictionary.loadTargetMap(target_map_buffer);
    return this;
};

DynamicDictionaries.prototype.loadConnectionCosts = function (cc_buffer) {
    this.connection_costs.loadConnectionCosts(cc_buffer);
    return this;
};

DynamicDictionaries.prototype.loadUnknownDictionaries = function (unk_buffer, unk_pos_buffer, unk_map_buffer, cat_map_buffer, compat_cat_map_buffer, invoke_def_buffer) {
    this.unknown_dictionary.loadUnknownDictionaries(unk_buffer, unk_pos_buffer, unk_map_buffer, cat_map_buffer, compat_cat_map_buffer, invoke_def_buffer);
    return this;
};

module.exports = DynamicDictionaries;

},{"./ConnectionCosts":5,"./TokenInfoDictionary":8,"./UnknownDictionary":9,"doublearray":"doublearray"}],7:[function(require,module,exports){
/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

var ByteBuffer = require("../util/ByteBuffer");
var CharacterClass = require("./CharacterClass");

/**
 * InvokeDefinitionMap represents invoke definition a part of char.def
 * @constructor
 */
function InvokeDefinitionMap() {
    this.map = [];
    this.lookup_table = {};  // Just for building dictionary
}

/**
 * Load InvokeDefinitionMap from buffer
 * @param {Uint8Array} invoke_def_buffer
 * @returns {InvokeDefinitionMap}
 */
InvokeDefinitionMap.load = function (invoke_def_buffer) {
    var invoke_def = new InvokeDefinitionMap();
    var character_category_definition = [];

    var buffer = new ByteBuffer(invoke_def_buffer);
    while (buffer.position + 1 < buffer.size()) {
        var class_id = character_category_definition.length;
        var is_always_invoke = buffer.get();
        var is_grouping = buffer.get();
        var max_length = buffer.getInt();
        var class_name = buffer.getString();
        character_category_definition.push(new CharacterClass(class_id, class_name, is_always_invoke, is_grouping, max_length));
    }

    invoke_def.init(character_category_definition);

    return invoke_def;
};

/**
 * Initializing method
 * @param {Array.<CharacterClass>} character_category_definition Array of CharacterClass
 */
InvokeDefinitionMap.prototype.init = function (character_category_definition) {
    if (character_category_definition == null) {
        return;
    }
    for (var i = 0; i < character_category_definition.length; i++) {
        var character_class = character_category_definition[i];
        this.map[i] = character_class;
        this.lookup_table[character_class.class_name] = i;
    }
};

/**
 * Get class information by class ID
 * @param {number} class_id
 * @returns {CharacterClass}
 */
InvokeDefinitionMap.prototype.getCharacterClass = function (class_id) {
    return this.map[class_id];
};

/**
 * For building character definition dictionary
 * @param {string} class_name character
 * @returns {number} class_id
 */
InvokeDefinitionMap.prototype.lookup = function (class_name) {
    var class_id = this.lookup_table[class_name];
    if (class_id == null) {
        return null;
    }
    return class_id;
};

/**
 * Transform from map to binary buffer
 * @returns {Uint8Array}
 */
InvokeDefinitionMap.prototype.toBuffer = function () {
    var buffer = new ByteBuffer();
    for (var i = 0; i < this.map.length; i++) {
        var char_class = this.map[i];
        buffer.put(char_class.is_always_invoke);
        buffer.put(char_class.is_grouping);
        buffer.putInt(char_class.max_length);
        buffer.putString(char_class.class_name);
    }
    buffer.shrink();
    return buffer.buffer;
};

module.exports = InvokeDefinitionMap;

},{"../util/ByteBuffer":16,"./CharacterClass":3}],8:[function(require,module,exports){
/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

var ByteBuffer = require("../util/ByteBuffer");

/**
 * TokenInfoDictionary
 * @constructor
 */
function TokenInfoDictionary() {
    this.dictionary = new ByteBuffer(10 * 1024 * 1024);
    this.target_map = {};  // trie_id (of surface form) -> token_info_id (of token)
    this.pos_buffer = new ByteBuffer(10 * 1024 * 1024);
}

// left_id right_id word_cost ...
// ^ this position is token_info_id
TokenInfoDictionary.prototype.buildDictionary = function (entries) {
    var dictionary_entries = {};  // using as hashmap, string -> string (word_id -> surface_form) to build dictionary

    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];

        if (entry.length < 4) {
            continue;
        }

        var surface_form = entry[0];
        var left_id = entry[1];
        var right_id = entry[2];
        var word_cost = entry[3];
        var feature = entry.slice(4).join(",");  // TODO Optimize

        // Assertion
        if (!isFinite(left_id) || !isFinite(right_id) || !isFinite(word_cost)) {
            console.log(entry);
        }

        var token_info_id = this.put(left_id, right_id, word_cost, surface_form, feature);
        dictionary_entries[token_info_id] = surface_form;
    }

    // Remove last unused area
    this.dictionary.shrink();
    this.pos_buffer.shrink();

    return dictionary_entries;
};

TokenInfoDictionary.prototype.put = function (left_id, right_id, word_cost, surface_form, feature) {
    var token_info_id = this.dictionary.position;
    var pos_id = this.pos_buffer.position;

    this.dictionary.putShort(left_id);
    this.dictionary.putShort(right_id);
    this.dictionary.putShort(word_cost);
    this.dictionary.putInt(pos_id);
    this.pos_buffer.putString(surface_form + "," + feature);

    return token_info_id;
};

TokenInfoDictionary.prototype.addMapping = function (source, target) {
    var mapping = this.target_map[source];
    if (mapping == null) {
        mapping = [];
    }
    mapping.push(target);

    this.target_map[source] = mapping;
};

TokenInfoDictionary.prototype.targetMapToBuffer = function () {
    var buffer = new ByteBuffer();
    var map_keys_size = Object.keys(this.target_map).length;
    buffer.putInt(map_keys_size);
    for (var key in this.target_map) {
        var values = this.target_map[key];  // Array
        var map_values_size = values.length;
        buffer.putInt(parseInt(key));
        buffer.putInt(map_values_size);
        for (var i = 0; i < values.length; i++) {
            buffer.putInt(values[i]);
        }
    }
    return buffer.shrink();  // Shrink-ed Typed Array
};

// from tid.dat
TokenInfoDictionary.prototype.loadDictionary = function (array_buffer) {
    this.dictionary = new ByteBuffer(array_buffer);
    return this;
};

// from tid_pos.dat
TokenInfoDictionary.prototype.loadPosVector = function (array_buffer) {
    this.pos_buffer = new ByteBuffer(array_buffer);
    return this;
};

// from tid_map.dat
TokenInfoDictionary.prototype.loadTargetMap = function (array_buffer) {
    var buffer = new ByteBuffer(array_buffer);
    buffer.position = 0;
    this.target_map = {};
    buffer.readInt();  // map_keys_size
    while (true) {
        if (buffer.buffer.length < buffer.position + 1) {
            break;
        }
        var key = buffer.readInt();
        var map_values_size = buffer.readInt();
        for (var i = 0; i < map_values_size; i++) {
            var value = buffer.readInt();
            this.addMapping(key, value);
        }
    }
    return this;
};

/**
 * Look up features in the dictionary
 * @param {string} token_info_id_str Word ID to look up
 * @returns {string} Features string concatenated by ","
 */
TokenInfoDictionary.prototype.getFeatures = function (token_info_id_str) {
    var token_info_id = parseInt(token_info_id_str);
    if (isNaN(token_info_id)) {
        // TODO throw error
        return "";
    }
    var pos_id = this.dictionary.getInt(token_info_id + 6);
    return this.pos_buffer.getString(pos_id);
};

module.exports = TokenInfoDictionary;

},{"../util/ByteBuffer":16}],9:[function(require,module,exports){
/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

var TokenInfoDictionary = require("./TokenInfoDictionary");
var CharacterDefinition = require("./CharacterDefinition");
var ByteBuffer = require("../util/ByteBuffer");

/**
 * UnknownDictionary
 * @constructor
 */
function UnknownDictionary() {
    this.dictionary = new ByteBuffer(10 * 1024 * 1024);
    this.target_map = {};  // class_id (of CharacterClass) -> token_info_id (of unknown class)
    this.pos_buffer = new ByteBuffer(10 * 1024 * 1024);
    this.character_definition = null;
}

// Inherit from TokenInfoDictionary as a super class
UnknownDictionary.prototype = Object.create(TokenInfoDictionary.prototype);

UnknownDictionary.prototype.characterDefinition = function (character_definition) {
    this.character_definition = character_definition;
    return this;
};

UnknownDictionary.prototype.lookup = function (ch) {
    return this.character_definition.lookup(ch);
};

UnknownDictionary.prototype.lookupCompatibleCategory = function (ch) {
    return this.character_definition.lookupCompatibleCategory(ch);
};

UnknownDictionary.prototype.loadUnknownDictionaries = function (unk_buffer, unk_pos_buffer, unk_map_buffer, cat_map_buffer, compat_cat_map_buffer, invoke_def_buffer) {
    this.loadDictionary(unk_buffer);
    this.loadPosVector(unk_pos_buffer);
    this.loadTargetMap(unk_map_buffer);
    this.character_definition = CharacterDefinition.load(cat_map_buffer, compat_cat_map_buffer, invoke_def_buffer);
};

module.exports = UnknownDictionary;

},{"../util/ByteBuffer":16,"./CharacterDefinition":4,"./TokenInfoDictionary":8}],10:[function(require,module,exports){
/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

var CharacterDefinition = require("../CharacterDefinition");
var InvokeDefinitionMap = require("../InvokeDefinitionMap");

var CATEGORY_DEF_PATTERN = /^(\w+)\s+(\d)\s+(\d)\s+(\d)/;
var CATEGORY_MAPPING_PATTERN = /^(0x[0-9A-F]{4})(?:\s+([^#\s]+))(?:\s+([^#\s]+))*/;
var RANGE_CATEGORY_MAPPING_PATTERN = /^(0x[0-9A-F]{4})\.\.(0x[0-9A-F]{4})(?:\s+([^#\s]+))(?:\s+([^#\s]+))*/;

/**
 * CharacterDefinitionBuilder
 * @constructor
 */
function CharacterDefinitionBuilder() {
    this.char_def = new CharacterDefinition();
    this.char_def.invoke_definition_map = new InvokeDefinitionMap();
    this.character_category_definition = [];
    this.category_mapping = [];
}

CharacterDefinitionBuilder.prototype.putLine = function (line) {
    var parsed_category_def = CATEGORY_DEF_PATTERN.exec(line);
    if (parsed_category_def != null) {
        var class_id = this.character_category_definition.length;
        var char_class = CharacterDefinition.parseCharCategory(class_id, parsed_category_def);
        if (char_class == null) {
            return;
        }
        this.character_category_definition.push(char_class);
        return;
    }
    var parsed_category_mapping = CATEGORY_MAPPING_PATTERN.exec(line);
    if (parsed_category_mapping != null) {
        var mapping = CharacterDefinition.parseCategoryMapping(parsed_category_mapping);
        this.category_mapping.push(mapping);
    }
    var parsed_range_category_mapping = RANGE_CATEGORY_MAPPING_PATTERN.exec(line);
    if (parsed_range_category_mapping != null) {
        var range_mapping = CharacterDefinition.parseRangeCategoryMapping(parsed_range_category_mapping);
        this.category_mapping.push(range_mapping);
    }
};

CharacterDefinitionBuilder.prototype.build = function () {
    // TODO If DEFAULT category does not exist, throw error
    this.char_def.invoke_definition_map.init(this.character_category_definition);
    this.char_def.initCategoryMappings(this.category_mapping);
    return this.char_def;
};

module.exports = CharacterDefinitionBuilder;

},{"../CharacterDefinition":4,"../InvokeDefinitionMap":7}],11:[function(require,module,exports){
/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

var ConnectionCosts = require("../ConnectionCosts");

/**
 * Builder class for constructing ConnectionCosts object
 * @constructor
 */
function ConnectionCostsBuilder() {
    this.lines = 0;
    this.connection_cost = null;
}

ConnectionCostsBuilder.prototype.putLine = function (line) {
    if (this.lines === 0) {
        var dimensions = line.split(" ");
        var forward_dimension = dimensions[0];
        var backward_dimension = dimensions[1];

        if (forward_dimension < 0 || backward_dimension < 0) {
            throw "Parse error of matrix.def";
        }

        this.connection_cost = new ConnectionCosts(forward_dimension, backward_dimension);
        this.lines++;
        return this;
    }

    var costs = line.split(" ");

    if (costs.length !== 3) {
        return this;
    }

    var forward_id = parseInt(costs[0]);
    var backward_id = parseInt(costs[1]);
    var cost = parseInt(costs[2]);

    if (forward_id < 0 || backward_id < 0 || !isFinite(forward_id) || !isFinite(backward_id) ||
        this.connection_cost.forward_dimension <= forward_id || this.connection_cost.backward_dimension <= backward_id) {
        throw "Parse error of matrix.def";
    }

    this.connection_cost.put(forward_id, backward_id, cost);
    this.lines++;
    return this;
};

ConnectionCostsBuilder.prototype.build = function () {
    return this.connection_cost;
};

module.exports = ConnectionCostsBuilder;

},{"../ConnectionCosts":5}],12:[function(require,module,exports){
/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

var doublearray = require("doublearray");
var DynamicDictionaries = require("../DynamicDictionaries");
var TokenInfoDictionary = require("../TokenInfoDictionary");
var ConnectionCostsBuilder = require("./ConnectionCostsBuilder");
var CharacterDefinitionBuilder = require("./CharacterDefinitionBuilder");
var UnknownDictionary = require("../UnknownDictionary");

/**
 * Build dictionaries (token info, connection costs)
 *
 * Generates from matrix.def
 * cc.dat: Connection costs
 *
 * Generates from *.csv
 * dat.dat: Double array
 * tid.dat: Token info dictionary
 * tid_map.dat: targetMap
 * tid_pos.dat: posList (part of speech)
 */
function DictionaryBuilder() {
    // Array of entries, each entry in Mecab form
    // (0: surface form, 1: left id, 2: right id, 3: word cost, 4: part of speech id, 5-: other features)
    this.tid_entries = [];
    this.unk_entries = [];
    this.cc_builder = new ConnectionCostsBuilder();
    this.cd_builder = new CharacterDefinitionBuilder();
}

DictionaryBuilder.prototype.addTokenInfoDictionary = function (line) {
    var new_entry = line.split(",");
    this.tid_entries.push(new_entry);
    return this;
};

/**
 * Put one line of "matrix.def" file for building ConnectionCosts object
 * @param {string} line is a line of "matrix.def"
 */
DictionaryBuilder.prototype.putCostMatrixLine = function (line) {
    this.cc_builder.putLine(line);
    return this;
};

DictionaryBuilder.prototype.putCharDefLine = function (line) {
    this.cd_builder.putLine(line);
    return this;
};

/**
 * Put one line of "unk.def" file for building UnknownDictionary object
 * @param {string} line is a line of "unk.def"
 */
DictionaryBuilder.prototype.putUnkDefLine = function (line) {
    this.unk_entries.push(line.split(","));
    return this;
};

DictionaryBuilder.prototype.build = function () {
    var dictionaries = this.buildTokenInfoDictionary();
    var unknown_dictionary = this.buildUnknownDictionary();

    return new DynamicDictionaries(dictionaries.trie, dictionaries.token_info_dictionary, this.cc_builder.build(), unknown_dictionary);
};

/**
 * Build TokenInfoDictionary
 *
 * @returns {{trie: *, token_info_dictionary: *}}
 */
DictionaryBuilder.prototype.buildTokenInfoDictionary = function () {

    var token_info_dictionary = new TokenInfoDictionary();

    // using as hashmap, string -> string (word_id -> surface_form) to build dictionary
    var dictionary_entries = token_info_dictionary.buildDictionary(this.tid_entries);

    var trie = this.buildDoubleArray();

    for (var token_info_id in dictionary_entries) {
        var surface_form = dictionary_entries[token_info_id];
        var trie_id = trie.lookup(surface_form);

        // Assertion
        // if (trie_id < 0) {
        //     console.log("Not Found:" + surface_form);
        // }

        token_info_dictionary.addMapping(trie_id, token_info_id);
    }

    return {
        trie: trie,
        token_info_dictionary: token_info_dictionary
    };
};

DictionaryBuilder.prototype.buildUnknownDictionary = function () {

    var unk_dictionary = new UnknownDictionary();

    // using as hashmap, string -> string (word_id -> surface_form) to build dictionary
    var dictionary_entries = unk_dictionary.buildDictionary(this.unk_entries);

    var char_def = this.cd_builder.build(); // Create CharacterDefinition

    unk_dictionary.characterDefinition(char_def);

    for (var token_info_id in dictionary_entries) {
        var class_name = dictionary_entries[token_info_id];
        var class_id = char_def.invoke_definition_map.lookup(class_name);

        // Assertion
        // if (trie_id < 0) {
        //     console.log("Not Found:" + surface_form);
        // }

        unk_dictionary.addMapping(class_id, token_info_id);
    }

    return unk_dictionary;
};

/**
 * Build double array trie
 *
 * @returns {DoubleArray} Double-Array trie
 */
DictionaryBuilder.prototype.buildDoubleArray = function () {
    var trie_id = 0;
    var words = this.tid_entries.map(function (entry) {
        var surface_form = entry[0];
        return { k: surface_form, v: trie_id++ };
    });

    var builder = doublearray.builder(1024 * 1024);
    return builder.build(words);
};

module.exports = DictionaryBuilder;

},{"../DynamicDictionaries":6,"../TokenInfoDictionary":8,"../UnknownDictionary":9,"./CharacterDefinitionBuilder":10,"./ConnectionCostsBuilder":11,"doublearray":"doublearray"}],13:[function(require,module,exports){
/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

var TokenizerBuilder = require("./TokenizerBuilder");
var DictionaryBuilder = require("./dict/builder/DictionaryBuilder");

// Public methods
var kuromoji = {
    builder: function (option) {
        return new TokenizerBuilder(option);
    },
    dictionaryBuilder: function () {
        return new DictionaryBuilder();
    }
};

module.exports = kuromoji;

},{"./TokenizerBuilder":2,"./dict/builder/DictionaryBuilder":12}],14:[function(require,module,exports){
/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

var fflate = require("fflate");
var DictionaryLoader = require("./DictionaryLoader");

/**
 * BrowserDictionaryLoader inherits DictionaryLoader, using jQuery XHR for download
 * @param {string} dic_path Dictionary path
 * @constructor
 */
function BrowserDictionaryLoader(dic_path) {
    DictionaryLoader.apply(this, [dic_path]);
}

BrowserDictionaryLoader.prototype = Object.create(DictionaryLoader.prototype);

/**
 * Utility function to load gzipped dictionary
 * @param {string} url Dictionary URL
 * @param {BrowserDictionaryLoader~onLoad} callback Callback function
 */
BrowserDictionaryLoader.prototype.loadArrayBuffer = function (url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = "arraybuffer";
    xhr.onload = function () {
        if (this.status > 0 && this.status !== 200) {
            callback(xhr.statusText, null);
            return;
        }
        var arraybuffer = this.response;

        var gz = fflate.gunzipSync(new Uint8Array(arraybuffer));
            callback(null, gz);
    };
    xhr.onerror = function (err) {
        callback(err, null);
    };
    xhr.send();
};

/**
 * Callback
 * @callback BrowserDictionaryLoader~onLoad
 * @param {Object} err Error object
 * @param {Uint8Array} buffer Loaded buffer
 */

module.exports = BrowserDictionaryLoader;

},{"./DictionaryLoader":15,"fflate":"fflate"}],15:[function(require,module,exports){
/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var async = require('async');
var DynamicDictionaries = require('../dict/DynamicDictionaries');

/**
 * DictionaryLoader base constructor
 * @param {string} dic_path Dictionary path
 * @constructor
 */
function DictionaryLoader(dic_path) {
  this.dic = new DynamicDictionaries();
  this.dic_path = dic_path;
}

DictionaryLoader.prototype.loadArrayBuffer = function (file, callback) {
  throw new Error('DictionaryLoader#loadArrayBuffer should be overwrite');
};

/**
 * Load dictionary files
 * @param {DictionaryLoader~onLoad} load_callback Callback function called after loaded
 */
DictionaryLoader.prototype.load = function (load_callback) {
  var dic = this.dic;
  var dic_path = this.dic_path;
  var loadArrayBuffer = this.loadArrayBuffer;
  var dic_path_url = function (filename) {
    var separator = '/';
    var replace = new RegExp(separator + '{1,}', 'g');
    var path = [dic_path, filename].join(separator).replace(replace, separator);

    return path;
  };

  async.parallel(
    [
      // Trie
      function (callback) {
        async.map(
          ['base.dat.gz', 'check.dat.gz'],
          function (filename, _callback) {
            loadArrayBuffer(dic_path_url(filename), function (err, buffer) {
              if (err) {
                return _callback(err);
              }
              _callback(null, buffer);
            });
          },
          function (err, buffers) {
            if (err) {
              return callback(err);
            }
            var base_buffer = new Int32Array(buffers[0]);
            var check_buffer = new Int32Array(buffers[1]);

            dic.loadTrie(base_buffer, check_buffer);
            callback(null);
          }
        );
      },
      // Token info dictionaries
      function (callback) {
        async.map(
          ['tid.dat.gz', 'tid_pos.dat.gz', 'tid_map.dat.gz'],
          function (filename, _callback) {
            loadArrayBuffer(dic_path_url(filename), function (err, buffer) {
              if (err) {
                return _callback(err);
              }
              _callback(null, buffer);
            });
          },
          function (err, buffers) {
            if (err) {
              return callback(err);
            }
            var token_info_buffer = new Uint8Array(buffers[0]);
            var pos_buffer = new Uint8Array(buffers[1]);
            var target_map_buffer = new Uint8Array(buffers[2]);

            dic.loadTokenInfoDictionaries(
              token_info_buffer,
              pos_buffer,
              target_map_buffer
            );
            callback(null);
          }
        );
      },
      // Connection cost matrix
      function (callback) {
        loadArrayBuffer(dic_path_url('cc.dat.gz'), function (err, buffer) {
          if (err) {
            return callback(err);
          }
          var cc_buffer = new Int16Array(buffer);
          dic.loadConnectionCosts(cc_buffer);
          callback(null);
        });
      },
      // Unknown dictionaries
      function (callback) {
        async.map(
          [
            'unk.dat.gz',
            'unk_pos.dat.gz',
            'unk_map.dat.gz',
            'unk_char.dat.gz',
            'unk_compat.dat.gz',
            'unk_invoke.dat.gz',
          ],
          function (filename, _callback) {
            loadArrayBuffer(dic_path_url(filename), function (err, buffer) {
              if (err) {
                return _callback(err);
              }
              _callback(null, buffer);
            });
          },
          function (err, buffers) {
            if (err) {
              return callback(err);
            }
            var unk_buffer = new Uint8Array(buffers[0]);
            var unk_pos_buffer = new Uint8Array(buffers[1]);
            var unk_map_buffer = new Uint8Array(buffers[2]);
            var cat_map_buffer = new Uint8Array(buffers[3]);
            var compat_cat_map_buffer = new Uint32Array(buffers[4]);
            var invoke_def_buffer = new Uint8Array(buffers[5]);

            dic.loadUnknownDictionaries(
              unk_buffer,
              unk_pos_buffer,
              unk_map_buffer,
              cat_map_buffer,
              compat_cat_map_buffer,
              invoke_def_buffer
            );
            // dic.loadUnknownDictionaries(char_buffer, unk_buffer);
            callback(null);
          }
        );
      },
    ],
    function (err) {
      load_callback(err, dic);
    }
  );
};

/**
 * Callback
 * @callback DictionaryLoader~onLoad
 * @param {Object} err Error object
 * @param {DynamicDictionaries} dic Loaded dictionary
 */

module.exports = DictionaryLoader;

},{"../dict/DynamicDictionaries":6,"async":"async"}],16:[function(require,module,exports){
/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

/**
 * Convert String (UTF-16) to UTF-8 ArrayBuffer
 *
 * @param {String} str UTF-16 string to convert
 * @return {Uint8Array} Byte sequence encoded by UTF-8
 */
var stringToUtf8Bytes = function (str) {

    // Max size of 1 character is 4 bytes
    var bytes = new Uint8Array(str.length * 4);

    var i = 0, j = 0;

    while (i < str.length) {
        var unicode_code;

        var utf16_code = str.charCodeAt(i++);
        if (utf16_code >= 0xD800 && utf16_code <= 0xDBFF) {
            // surrogate pair
            var upper = utf16_code;           // high surrogate
            var lower = str.charCodeAt(i++);  // low surrogate

            if (lower >= 0xDC00 && lower <= 0xDFFF) {
                unicode_code =
                    (upper - 0xD800) * (1 << 10) + (1 << 16) +
                    (lower - 0xDC00);
            } else {
                // malformed surrogate pair
                return null;
            }
        } else {
            // not surrogate code
            unicode_code = utf16_code;
        }

        if (unicode_code < 0x80) {
            // 1-byte
            bytes[j++] = unicode_code;

        } else if (unicode_code < (1 << 11)) {
            // 2-byte
            bytes[j++] = (unicode_code >>> 6) | 0xC0;
            bytes[j++] = (unicode_code & 0x3F) | 0x80;

        } else if (unicode_code < (1 << 16)) {
            // 3-byte
            bytes[j++] = (unicode_code >>> 12) | 0xE0;
            bytes[j++] = ((unicode_code >> 6) & 0x3f) | 0x80;
            bytes[j++] = (unicode_code & 0x3F) | 0x80;

        } else if (unicode_code < (1 << 21)) {
            // 4-byte
            bytes[j++] = (unicode_code >>> 18) | 0xF0;
            bytes[j++] = ((unicode_code >> 12) & 0x3F) | 0x80;
            bytes[j++] = ((unicode_code >> 6) & 0x3F) | 0x80;
            bytes[j++] = (unicode_code & 0x3F) | 0x80;

        } else {
            // malformed UCS4 code
        }
    }

    return bytes.subarray(0, j);
};

/**
 * Convert UTF-8 ArrayBuffer to String (UTF-16)
 *
 * @param {Array} bytes UTF-8 byte sequence to convert
 * @return {String} String encoded by UTF-16
 */
var utf8BytesToString = function (bytes) {

    var str = "";
    var code, b1, b2, b3, b4, upper, lower;
    var i = 0;

    while (i < bytes.length) {

        b1 = bytes[i++];

        if (b1 < 0x80) {
            // 1 byte
            code = b1;
        } else if ((b1 >> 5) === 0x06) {
            // 2 bytes
            b2 = bytes[i++];
            code = ((b1 & 0x1f) << 6) | (b2 & 0x3f);
        } else if ((b1 >> 4) === 0x0e) {
            // 3 bytes
            b2 = bytes[i++];
            b3 = bytes[i++];
            code = ((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
        } else {
            // 4 bytes
            b2 = bytes[i++];
            b3 = bytes[i++];
            b4 = bytes[i++];
            code = ((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f);
        }

        if (code < 0x10000) {
            str += String.fromCharCode(code);
        } else {
            // surrogate pair
            code -= 0x10000;
            upper = (0xD800 | (code >> 10));
            lower = (0xDC00 | (code & 0x3FF));
            str += String.fromCharCode(upper, lower);
        }
    }

    return str;
};

/**
 * Utilities to manipulate byte sequence
 * @param {(number|Uint8Array)} arg Initial size of this buffer (number), or buffer to set (Uint8Array)
 * @constructor
 */
function ByteBuffer(arg) {
    var initial_size;
    if (arg == null) {
        initial_size = 1024 * 1024;
    } else if (typeof arg === "number") {
        initial_size = arg;
    } else if (arg instanceof Uint8Array) {
        this.buffer = arg;
        this.position = 0;  // Overwrite
        return;
    } else {
        // typeof arg -> String
        throw typeof arg + " is invalid parameter type for ByteBuffer constructor";
    }
    // arg is null or number
    this.buffer = new Uint8Array(initial_size);
    this.position = 0;
}

ByteBuffer.prototype.size = function () {
    return this.buffer.length;
};

ByteBuffer.prototype.reallocate = function () {
    var new_array = new Uint8Array(this.buffer.length * 2);
    new_array.set(this.buffer);
    this.buffer = new_array;
};

ByteBuffer.prototype.shrink = function () {
    this.buffer = this.buffer.subarray(0, this.position);
    return this.buffer;
};

ByteBuffer.prototype.put = function (b) {
    if (this.buffer.length < this.position + 1) {
        this.reallocate();
    }
    this.buffer[this.position++] = b;
};

ByteBuffer.prototype.get = function (index) {
    if (index == null) {
        index = this.position;
        this.position += 1;
    }
    if (this.buffer.length < index + 1) {
        return 0;
    }
    return this.buffer[index];
};

// Write short to buffer by little endian
ByteBuffer.prototype.putShort = function (num) {
    if (0xFFFF < num) {
        throw num + " is over short value";
    }
    var lower = (0x00FF & num);
    var upper = (0xFF00 & num) >> 8;
    this.put(lower);
    this.put(upper);
};

// Read short from buffer by little endian
ByteBuffer.prototype.getShort = function (index) {
    if (index == null) {
        index = this.position;
        this.position += 2;
    }
    if (this.buffer.length < index + 2) {
        return 0;
    }
    var lower = this.buffer[index];
    var upper = this.buffer[index + 1];
    var value = (upper << 8) + lower;
    if (value & 0x8000) {
	value = -((value - 1) ^ 0xFFFF);
    }
    return value;
};

// Write integer to buffer by little endian
ByteBuffer.prototype.putInt = function (num) {
    if (0xFFFFFFFF < num) {
        throw num + " is over integer value";
    }
    var b0 = (0x000000FF & num);
    var b1 = (0x0000FF00 & num) >> 8;
    var b2 = (0x00FF0000 & num) >> 16;
    var b3 = (0xFF000000 & num) >> 24;
    this.put(b0);
    this.put(b1);
    this.put(b2);
    this.put(b3);
};

// Read integer from buffer by little endian
ByteBuffer.prototype.getInt = function (index) {
    if (index == null) {
        index = this.position;
        this.position += 4;
    }
    if (this.buffer.length < index + 4) {
        return 0;
    }
    var b0 = this.buffer[index];
    var b1 = this.buffer[index + 1];
    var b2 = this.buffer[index + 2];
    var b3 = this.buffer[index + 3];

    return (b3 << 24) + (b2 << 16) + (b1 << 8) + b0;
};

ByteBuffer.prototype.readInt = function () {
    var pos = this.position;
    this.position += 4;
    return this.getInt(pos);
};

ByteBuffer.prototype.putString = function (str) {
    var bytes = stringToUtf8Bytes(str);
    for (var i = 0; i < bytes.length; i++) {
        this.put(bytes[i]);
    }
    // put null character as terminal character
    this.put(0);
};

ByteBuffer.prototype.getString = function (index) {
    var buf = [],
        ch;
    if (index == null) {
        index = this.position;
    }
    while (true) {
        if (this.buffer.length < index + 1) {
            break;
        }
        ch = this.get(index++);
        if (ch === 0) {
            break;
        } else {
            buf.push(ch);
        }
    }
    this.position = index;
    return utf8BytesToString(buf);
};

module.exports = ByteBuffer;

},{}],17:[function(require,module,exports){
/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

/**
 * Mappings between IPADIC dictionary features and tokenized results
 * @constructor
 */
function IpadicFormatter() {
}

IpadicFormatter.prototype.formatEntry = function (word_id, position, type, features) {
    var token = {};
    token.word_id = word_id;
    token.word_type = type;
    token.word_position = position;

    token.surface_form = features[0];
    token.pos = features[1];
    token.pos_detail_1 = features[2];
    token.pos_detail_2 = features[3];
    token.pos_detail_3 = features[4];
    token.conjugated_type = features[5];
    token.conjugated_form = features[6];
    token.basic_form = features[7];
    token.reading = features[8];
    token.pronunciation = features[9];

    return token;
};

IpadicFormatter.prototype.formatUnknownEntry = function (word_id, position, type, features, surface_form) {
    var token = {};
    token.word_id = word_id;
    token.word_type = type;
    token.word_position = position;

    token.surface_form = surface_form;
    token.pos = features[1];
    token.pos_detail_1 = features[2];
    token.pos_detail_2 = features[3];
    token.pos_detail_3 = features[4];
    token.conjugated_type = features[5];
    token.conjugated_form = features[6];
    token.basic_form = features[7];
    // token.reading = features[8];
    // token.pronunciation = features[9];

    return token;
};

module.exports = IpadicFormatter;

},{}],18:[function(require,module,exports){
/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

/**
 * String wrapper for UTF-16 surrogate pair (4 bytes)
 * @param {string} str String to wrap
 * @constructor
 */
function SurrogateAwareString(str) {
    this.str = str;
    this.index_mapping = [];

    for (var pos = 0; pos < str.length; pos++) {
        var ch = str.charAt(pos);
        this.index_mapping.push(pos);
        if (SurrogateAwareString.isSurrogatePair(ch)) {
            pos++;
        }
    }
    // Surrogate aware length
    this.length = this.index_mapping.length;
}

SurrogateAwareString.prototype.slice = function (index) {
    if (this.index_mapping.length <= index) {
        return "";
    }
    var surrogate_aware_index = this.index_mapping[index];
    return this.str.slice(surrogate_aware_index);
};

SurrogateAwareString.prototype.charAt = function (index) {
    if (this.str.length <= index) {
        return "";
    }
    var surrogate_aware_start_index = this.index_mapping[index];
    var surrogate_aware_end_index = this.index_mapping[index + 1];

    if (surrogate_aware_end_index == null) {
        return this.str.slice(surrogate_aware_start_index);
    }
    return this.str.slice(surrogate_aware_start_index, surrogate_aware_end_index);
};

SurrogateAwareString.prototype.charCodeAt = function (index) {
    if (this.index_mapping.length <= index) {
        return NaN;
    }
    var surrogate_aware_index = this.index_mapping[index];
    var upper = this.str.charCodeAt(surrogate_aware_index);
    var lower;
    if (upper >= 0xD800 && upper <= 0xDBFF && surrogate_aware_index < this.str.length) {
        lower = this.str.charCodeAt(surrogate_aware_index + 1);
        if (lower >= 0xDC00 && lower <= 0xDFFF) {
            return (upper - 0xD800) * 0x400 + lower - 0xDC00 + 0x10000;
        }
    }
    return upper;
};

SurrogateAwareString.prototype.toString = function () {
    return this.str;
};

SurrogateAwareString.isSurrogatePair = function (ch) {
    var utf16_code = ch.charCodeAt(0);
    if (utf16_code >= 0xD800 && utf16_code <= 0xDBFF) {
        // surrogate pair
        return true;
    } else {
        return false;
    }
};

module.exports = SurrogateAwareString;

},{}],19:[function(require,module,exports){
/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

var ViterbiNode = require("./ViterbiNode");
var ViterbiLattice = require("./ViterbiLattice");
var SurrogateAwareString = require("../util/SurrogateAwareString");

/**
 * ViterbiBuilder builds word lattice (ViterbiLattice)
 * @param {DynamicDictionaries} dic dictionary
 * @constructor
 */
function ViterbiBuilder(dic) {
    this.trie = dic.trie;
    this.token_info_dictionary = dic.token_info_dictionary;
    this.unknown_dictionary = dic.unknown_dictionary;
}

/**
 * Build word lattice
 * @param {string} sentence_str Input text
 * @returns {ViterbiLattice} Word lattice
 */
ViterbiBuilder.prototype.build = function (sentence_str) {
    var lattice = new ViterbiLattice();
    var sentence = new SurrogateAwareString(sentence_str);

    var key, trie_id, left_id, right_id, word_cost;
    for (var pos = 0; pos < sentence.length; pos++) {
        var tail = sentence.slice(pos);
        var vocabulary = this.trie.commonPrefixSearch(tail);
        for (var n = 0; n < vocabulary.length; n++) {  // Words in dictionary do not have surrogate pair (only UCS2 set)
            trie_id = vocabulary[n].v;
            key = vocabulary[n].k;

            var token_info_ids = this.token_info_dictionary.target_map[trie_id];
            for (var i = 0; i < token_info_ids.length; i++) {
                var token_info_id = parseInt(token_info_ids[i]);

                left_id = this.token_info_dictionary.dictionary.getShort(token_info_id);
                right_id = this.token_info_dictionary.dictionary.getShort(token_info_id + 2);
                word_cost = this.token_info_dictionary.dictionary.getShort(token_info_id + 4);

                // node_name, cost, start_index, length, type, left_id, right_id, surface_form
                lattice.append(new ViterbiNode(token_info_id, word_cost, pos + 1, key.length, "KNOWN", left_id, right_id, key));
            }
        }

        // Unknown word processing
        var surrogate_aware_tail = new SurrogateAwareString(tail);
        var head_char = new SurrogateAwareString(surrogate_aware_tail.charAt(0));
        var head_char_class = this.unknown_dictionary.lookup(head_char.toString());
        if (vocabulary == null || vocabulary.length === 0 || head_char_class.is_always_invoke === 1) {
            // Process unknown word
            key = head_char;
            if (head_char_class.is_grouping === 1 && 1 < surrogate_aware_tail.length) {
                for (var k = 1; k < surrogate_aware_tail.length; k++) {
                    var next_char = surrogate_aware_tail.charAt(k);
                    var next_char_class = this.unknown_dictionary.lookup(next_char);
                    if (head_char_class.class_name !== next_char_class.class_name) {
                        break;
                    }
                    key += next_char;
                }
            }

            var unk_ids = this.unknown_dictionary.target_map[head_char_class.class_id];
            for (var j = 0; j < unk_ids.length; j++) {
                var unk_id = parseInt(unk_ids[j]);

                left_id = this.unknown_dictionary.dictionary.getShort(unk_id);
                right_id = this.unknown_dictionary.dictionary.getShort(unk_id + 2);
                word_cost = this.unknown_dictionary.dictionary.getShort(unk_id + 4);

                // node_name, cost, start_index, length, type, left_id, right_id, surface_form
                lattice.append(new ViterbiNode(unk_id, word_cost, pos + 1, key.length, "UNKNOWN", left_id, right_id, key.toString()));
            }
        }
    }
    lattice.appendEos();

    return lattice;
};

module.exports = ViterbiBuilder;

},{"../util/SurrogateAwareString":18,"./ViterbiLattice":20,"./ViterbiNode":21}],20:[function(require,module,exports){
/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

var ViterbiNode = require("./ViterbiNode");

/**
 * ViterbiLattice is a lattice in Viterbi algorithm
 * @constructor
 */
function ViterbiLattice() {
    this.nodes_end_at = [];
    this.nodes_end_at[0] = [ new ViterbiNode(-1, 0, 0, 0, "BOS", 0, 0, "") ];
    this.eos_pos = 1;
}

/**
 * Append node to ViterbiLattice
 * @param {ViterbiNode} node
 */
ViterbiLattice.prototype.append = function (node) {
    var last_pos = node.start_pos + node.length - 1;
    if (this.eos_pos < last_pos) {
        this.eos_pos = last_pos;
    }

    var prev_nodes = this.nodes_end_at[last_pos];
    if (prev_nodes == null) {
        prev_nodes = [];
    }
    prev_nodes.push(node);

    this.nodes_end_at[last_pos] = prev_nodes;
};

/**
 * Set ends with EOS (End of Statement)
 */
ViterbiLattice.prototype.appendEos = function () {
    var last_index = this.nodes_end_at.length;
    this.eos_pos++;
    this.nodes_end_at[last_index] = [ new ViterbiNode(-1, 0, this.eos_pos, 0, "EOS", 0, 0, "") ];
};

module.exports = ViterbiLattice;

},{"./ViterbiNode":21}],21:[function(require,module,exports){
/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

/**
 * ViterbiNode is a node of ViterbiLattice
 * @param {number} node_name Word ID
 * @param {number} node_cost Word cost to generate
 * @param {number} start_pos Start position from 1
 * @param {number} length Word length
 * @param {string} type Node type (KNOWN, UNKNOWN, BOS, EOS, ...)
 * @param {number} left_id Left context ID
 * @param {number} right_id Right context ID
 * @param {string} surface_form Surface form of this word
 * @constructor
 */
function ViterbiNode(node_name, node_cost, start_pos, length, type, left_id, right_id, surface_form) {
    this.name = node_name;
    this.cost = node_cost;
    this.start_pos = start_pos;
    this.length = length;
    this.left_id = left_id;
    this.right_id = right_id;
    this.prev = null;
    this.surface_form = surface_form;
    if (type === "BOS") {
        this.shortest_cost = 0;
    } else {
        this.shortest_cost = Number.MAX_VALUE;
    }
    this.type = type;
}

module.exports = ViterbiNode;

},{}],22:[function(require,module,exports){
/*
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

/**
 * ViterbiSearcher is for searching best Viterbi path
 * @param {ConnectionCosts} connection_costs Connection costs matrix
 * @constructor
 */
function ViterbiSearcher(connection_costs) {
    this.connection_costs = connection_costs;
}

/**
 * Search best path by forward-backward algorithm
 * @param {ViterbiLattice} lattice Viterbi lattice to search
 * @returns {Array} Shortest path
 */
ViterbiSearcher.prototype.search = function (lattice) {
    lattice = this.forward(lattice);
    return this.backward(lattice);
};

ViterbiSearcher.prototype.forward = function (lattice) {
    var i, j, k;
    for (i = 1; i <= lattice.eos_pos; i++) {
        var nodes = lattice.nodes_end_at[i];
        if (nodes == null) {
            continue;
        }
        for (j = 0; j < nodes.length; j++) {
            var node = nodes[j];
            var cost = Number.MAX_VALUE;
            var shortest_prev_node;

            var prev_nodes = lattice.nodes_end_at[node.start_pos - 1];
            if (prev_nodes == null) {
                // TODO process unknown words (repair word lattice)
                continue;
            }
            for (k = 0; k < prev_nodes.length; k++) {
                var prev_node = prev_nodes[k];

                var edge_cost;
                if (node.left_id == null || prev_node.right_id == null) {
                    // TODO assert
                    console.log("Left or right is null");
                    edge_cost = 0;
                } else {
                    edge_cost = this.connection_costs.get(prev_node.right_id, node.left_id);
                }

                var _cost = prev_node.shortest_cost + edge_cost + node.cost;
                if (_cost < cost) {
                    shortest_prev_node = prev_node;
                    cost = _cost;
                }
            }

            node.prev = shortest_prev_node;
            node.shortest_cost = cost;
        }
    }
    return lattice;
};

ViterbiSearcher.prototype.backward = function (lattice) {
    var shortest_path = [];
    var eos = lattice.nodes_end_at[lattice.nodes_end_at.length - 1][0];

    var node_back = eos.prev;
    if (node_back == null) {
        return [];
    }
    while (node_back.type !== "BOS") {
        shortest_path.push(node_back);
        if (node_back.prev == null) {
            // TODO Failed to back. Process unknown words?
            return [];
        }
        node_back = node_back.prev;
    }

    return shortest_path.reverse();
};

module.exports = ViterbiSearcher;

},{}]},{},[13])(13)
});

'use strict';
/**
 * The AuthorManager controlls all information about the Pad authors
 */

/*
 * 2011 Peter 'Pita' Martischka (Primary Technology Ltd)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const db = require('./DB');
const CustomError = require('../utils/customError');
const randomString = require('../../static/js/pad_utils').randomString;

exports.getColorPalette = () => [
  '#ffe8f2',
  '#f3edfe',
  '#e8f8ff',
  '#e6ffff',
  '#e8fdfb',
  '#ffffe6',
  '#ffebeb',
  '#f2f6f8',
  '#ffcde2',
  '#e4d7fc',
  '#cdf0ff',
  '#c8ffff',
  '#ccf9f4',
  '#fffec6',
  '#ffd4d4',
  '#e3ebef',
  '#ffb5d2',
  '#d6c3f8',
  '#b5e7ff',
  '#adfdff',
  '#b2f2ec',
  '#fffcaa',
  '#ffbfbf',
  '#d4e0e6',
  '#ff9fc4',
  '#c8b0f3',
  '#a0ddff',
  '#94f8ff',
  '#9aeae3',
  '#fff791',
  '#ffabab',
  '#c5d4dc',
  '#ff8cb6',
  '#bb9fec',
  '#8dd4ff',
  '#7ef1ff',
  '#84e0d7',
  '#fff17c',
  '#fe9a9a',
  '#b7c8d1',
  '#ff7ba9',
  '#ae8fe3',
  '#7ccaff',
  '#6be8f8',
  '#70d4ca',
  '#ffea6a',
  '#f88b8b',
  '#a9bdc6',
  '#fb6d9d',
  '#a181d9',
  '#6fc0ff',
  '#5bddee',
  '#5dc6bc',
  '#ffe05b',
  '#ef7e7e',
  '#9cb0ba',
  '#f06292',
  '#9575cd',
  '#64b5f6',
  '#4dd0e1',
  '#4db6ac',
  '#ffd54f',
  '#e57373',
  '#90a4ae',
];

/**
 * Checks if the author exists
 */
exports.doesAuthorExist = async (authorID) => {
  const author = await db.get(`globalAuthor:${authorID}`);

  return author != null;
};

/* exported for backwards compatibility */
exports.doesAuthorExists = exports.doesAuthorExist;

/**
 * Returns the AuthorID for a token.
 * @param {String} token The token
 */
exports.getAuthor4Token = async (token) => {
  const author = await mapAuthorWithDBKey('token2author', token);

  // return only the sub value authorID
  return author ? author.authorID : author;
};

/**
 * Returns the AuthorID for a mapper.
 * @param {String} token The mapper
 * @param {String} name The name of the author (optional)
 */
exports.createAuthorIfNotExistsFor = async (authorMapper, name) => {
  const author = await mapAuthorWithDBKey('mapper2author', authorMapper);

  if (name) {
    // set the name of this author
    await exports.setAuthorName(author.authorID, name);
  }

  return author;
};

/**
 * Returns the AuthorID for a mapper. We can map using a mapperkey,
 * so far this is token2author and mapper2author
 * @param {String} mapperkey The database key name for this mapper
 * @param {String} mapper The mapper
 */
async function mapAuthorWithDBKey(mapperkey, mapper) {
  // try to map to an author
  const author = await db.get(`${mapperkey}:${mapper}`);

  if (author == null) {
    // there is no author with this mapper, so create one
    const author = await exports.createAuthor(null);

    // create the token2author relation
    await db.set(`${mapperkey}:${mapper}`, author.authorID);

    // return the author
    return author;
  }

  // there is an author with this mapper
  // update the timestamp of this author
  await db.setSub(`globalAuthor:${author}`, ['timestamp'], Date.now());

  // return the author
  return {authorID: author};
}

/**
 * Internal function that creates the database entry for an author
 * @param {String} name The name of the author
 */
exports.createAuthor = (name) => {
  // create the new author name
  const author = `a.${randomString(16)}`;

  // create the globalAuthors db entry
  const authorObj = {
    colorId: Math.floor(Math.random() * (exports.getColorPalette().length)),
    name,
    timestamp: Date.now(),
  };

  // set the global author db entry
  // NB: no await, since we're not waiting for the DB set to finish
  db.set(`globalAuthor:${author}`, authorObj);

  return {authorID: author};
};

/**
 * Returns the Author Obj of the author
 * @param {String} author The id of the author
 */
exports.getAuthor = (author) => db.get(`globalAuthor:${author}`);

/**
 * Returns the color Id of the author
 * @param {String} author The id of the author
 */
exports.getAuthorColorId = (author) => db.getSub(`globalAuthor:${author}`, ['colorId']);

/**
 * Sets the color Id of the author
 * @param {String} author The id of the author
 * @param {String} colorId The color id of the author
 */
exports.setAuthorColorId = (author, colorId) => db.setSub(
    `globalAuthor:${author}`, ['colorId'], colorId);

/**
 * Returns the name of the author
 * @param {String} author The id of the author
 */
exports.getAuthorName = (author) => db.getSub(`globalAuthor:${author}`, ['name']);

/**
 * Sets the name of the author
 * @param {String} author The id of the author
 * @param {String} name The name of the author
 */
exports.setAuthorName = (author, name) => db.setSub(`globalAuthor:${author}`, ['name'], name);

/**
 * Returns an array of all pads this author contributed to
 * @param {String} author The id of the author
 */
exports.listPadsOfAuthor = async (authorID) => {
  /* There are two other places where this array is manipulated:
   * (1) When the author is added to a pad, the author object is also updated
   * (2) When a pad is deleted, each author of that pad is also updated
   */

  // get the globalAuthor
  const author = await db.get(`globalAuthor:${authorID}`);

  if (author == null) {
    // author does not exist
    throw new CustomError('authorID does not exist', 'apierror');
  }

  // everything is fine, return the pad IDs
  const padIDs = Object.keys(author.padIDs || {});

  return {padIDs};
};

/**
 * Adds a new pad to the list of contributions
 * @param {String} author The id of the author
 * @param {String} padID The id of the pad the author contributes to
 */
exports.addPad = async (authorID, padID) => {
  // get the entry
  const author = await db.get(`globalAuthor:${authorID}`);

  if (author == null) return;

  /*
   * ACHTUNG: padIDs can also be undefined, not just null, so it is not possible
   * to perform a strict check here
   */
  if (!author.padIDs) {
    // the entry doesn't exist so far, let's create it
    author.padIDs = {};
  }

  // add the entry for this pad
  author.padIDs[padID] = 1; // anything, because value is not used

  // save the new element back
  db.set(`globalAuthor:${authorID}`, author);
};

/**
 * Removes a pad from the list of contributions
 * @param {String} author The id of the author
 * @param {String} padID The id of the pad the author contributes to
 */
exports.removePad = async (authorID, padID) => {
  const author = await db.get(`globalAuthor:${authorID}`);

  if (author == null) return;

  if (author.padIDs != null) {
    // remove pad from author
    delete author.padIDs[padID];
    await db.set(`globalAuthor:${authorID}`, author);
  }
};

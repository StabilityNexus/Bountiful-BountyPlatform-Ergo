/**
 * Jest mock for ErgoScript (.es) files
 * This allows Jest to handle .es file imports without trying to parse them
 */
module.exports = {
  process() {
    return {
      code: 'module.exports = {};'
    };
  }
};


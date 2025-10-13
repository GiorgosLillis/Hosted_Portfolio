const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

function sanitizeHTML(html) {
  return DOMPurify.sanitize(html);
}

module.exports = sanitizeHTML;
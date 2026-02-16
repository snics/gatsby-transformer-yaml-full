const { readFile } = require('fs/promises')
const path = require('path')
const remarkHtml = require('remark-html')
const remarkParse = require('remark-parse')
const remarkStringify = require('remark-stringify')
const stripMarkdown = require('strip-markdown')
const unified = require('unified')

const NEWLINE_REGEXP = /\n|\r/

const remark = {}

module.exports = ({ node }, _, options = {}) => {
  return {
    tag: '!markdown',
    options: {
      kind: 'scalar',
      construct: async content => {
        if (!NEWLINE_REGEXP.test(content)) { // If the content is single line
          await readFile(path.resolve(node.dir, content), 'utf8')
            .then(data => {
              content = data
            }).catch(error => {
              if (
                error.code !== 'ENOENT' &&
                error.code !== 'ENAMETOOLONG'
              ) {
                throw error
              }
            })
        }

        // Build plugin list key for caching
        const pluginKeys = (options.plugins || [])
          .map(p => p.resolve || 'unknown')
          .join(':')
        const cacheKey = pluginKeys || 'default'

        if (!remark[cacheKey]) {
          // Create unified pipeline with remark plugins
          let processor = unified().use(remarkParse)

          // Apply configured remark plugins BEFORE remarkHtml
          if (options.plugins && Array.isArray(options.plugins)) {
            for (const plugin of options.plugins) {
              try {
                const pluginModule = require(plugin.resolve)
                processor = processor.use(pluginModule, plugin.options || {})
              } catch (error) {
                console.warn(`[gatsby-yaml-full-markdown] Could not load plugin: ${plugin.resolve}`, error.message)
              }
            }
          }

          // Apply remarkHtml last
          processor = processor.use(remarkHtml, options.remarkHtml || {})
          
          remark[cacheKey] = processor
        }

        if (!remark.plain) {
          remark.plain = unified()
            .use(remarkParse)
            .use(remarkStringify)
            .use(stripMarkdown)
        }

        return {
          html: `${await remark[cacheKey].process(content)}`,
          plain: `${await remark.plain.process(content)}`
        }
      }
    }
  }
}

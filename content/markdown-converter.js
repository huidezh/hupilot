(function() {
  'use strict';

  function isElement(node) {
    return node && node.nodeType === 1;
  }

  function isTextNode(node) {
    return node && node.nodeType === 3;
  }

  function getBestImageSrc(node) {
    var srcset = node.getAttribute('srcset');
    if (srcset) {
      var bestUrl = '';
      var bestWidth = 0;
      var tokens = srcset.trim().split(/\s+/);
      var urlParts = [];
      for (var i = 0; i < tokens.length; i++) {
        var token = tokens[i];
        var widthMatch = token.match(/^(\d+)w,?$/);
        if (widthMatch) {
          var width = parseInt(widthMatch[1], 10);
          if (urlParts.length > 0 && width > bestWidth) {
            var url = urlParts.join(' ').replace(/^,\s*/, '');
            if (url) {
              bestWidth = width;
              bestUrl = url;
            }
          }
          urlParts = [];
        } else if (/^\d+(?:\.\d+)?x,?$/.test(token)) {
          urlParts = [];
        } else {
          urlParts.push(token);
        }
      }
      if (bestUrl) return bestUrl;
    }
    return node.getAttribute('src') || '';
  }

  function isDirectTableChild(el, table) {
    var parent = el.parentNode;
    while (parent && parent !== table) {
      if (parent.nodeName === 'TABLE') return false;
      parent = parent.parentNode;
    }
    return parent === table;
  }

  function parseHTML(html) {
    var div = document.createElement('div');
    div.innerHTML = html;
    return div;
  }

  function cleanupTableHTML(element) {
    var allowed = ['src', 'href', 'style', 'align', 'width', 'height', 'rowspan', 'colspan', 'bgcolor', 'scope', 'valign', 'headers'];
    var clone = element.cloneNode(true);
    (function clean(el) {
      if (el.attributes) {
        var attrs = [];
        for (var i = 0; i < el.attributes.length; i++) attrs.push(el.attributes[i].name);
        for (var j = 0; j < attrs.length; j++) {
          if (allowed.indexOf(attrs[j]) === -1) el.removeAttribute(attrs[j]);
        }
      }
      for (var k = 0; k < el.childNodes.length; k++) {
        if (isElement(el.childNodes[k])) clean(el.childNodes[k]);
      }
    })(clone);
    return clone.outerHTML.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }

  function handleNestedEquations(element, ts) {
    var mathEls = element.querySelectorAll('math');
    if (mathEls.length === 0) return '';
    var parts = [];
    for (var i = 0; i < mathEls.length; i++) {
      var mathEl = mathEls[i];
      var annotation = mathEl.querySelector('annotation[encoding="application/x-tex"]');
      var latex = (annotation && annotation.textContent) ? annotation.textContent.trim() : mathEl.getAttribute('alttext');
      if (latex) {
        var isInline = mathEl.closest('.ltx_eqn_inline, .mwe-math-element-inline') !== null;
        parts.push(isInline ? '$' + latex + '$' : '\n$$\n' + latex + '\n$$');
      }
    }
    return parts.join('\n\n');
  }

  function extractLatex(element) {
    var latex = element.getAttribute('data-latex');
    var alttext = element.getAttribute('alttext');
    if (latex) return latex.trim();
    if (alttext) return alttext.trim();
    return '';
  }

  window.fullPageToMarkdown = function(htmlString) {
    var turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
      preformattedCode: true
    });

    // === Override built-in rules ===

    turndownService.addRule('table', {
      filter: 'table',
      replacement: function(content, node) {
        if (!isElement(node)) return content;

        if (node.classList && (node.classList.contains('ltx_equation') || node.classList.contains('ltx_eqn_table') || node.classList.contains('numblk'))) {
          return handleNestedEquations(node, turndownService);
        }

        var hasNestedTables = node.querySelector('table') !== null;
        var allCells = Array.from(node.querySelectorAll('td, th'));
        var directCells = allCells.filter(function(el) {
          return isDirectTableChild(el, node);
        });

        if (hasNestedTables || directCells.length <= 1) {
          var directRows = Array.from(node.querySelectorAll('tr')).filter(function(el) {
            return isDirectTableChild(el, node);
          });
          var cellCounts = directRows.map(function(tr) {
            return directCells.filter(function(cell) {
              return cell.parentNode === tr;
            }).length;
          });
          var isSingleColumn = directRows.length > 0 && new Set(cellCounts).size === 1 && cellCounts[0] <= 1;
          if (isSingleColumn) {
            var layoutHtml = directCells.map(function(cell) {
              return cell.outerHTML;
            }).join('');
            return '\n\n' + turndownService.turndown(layoutHtml) + '\n\n';
          }
        }

        var cells = Array.from(node.querySelectorAll('td, th'));
        var hasComplex = cells.some(function(cell) {
          return cell.hasAttribute('colspan') || cell.hasAttribute('rowspan');
        });
        if (hasComplex) {
          return '\n\n' + cleanupTableHTML(node) + '\n\n';
        }

        var tableEl = node;
        var rowElements = tableEl.rows && tableEl.rows.length > 0
          ? Array.from(tableEl.rows)
          : Array.from(node.querySelectorAll('tr')).filter(function(tr) {
              return isDirectTableChild(tr, node);
            });

        var rows = rowElements.map(function(row) {
          var cellElements = row.cells && row.cells.length > 0
            ? Array.from(row.cells)
            : Array.from(row.querySelectorAll('td, th')).filter(function(cell) {
                return cell.parentNode === row;
              });
          var cellContents = cellElements.map(function(cell) {
            var cellContent = turndownService.turndown(cell.outerHTML)
              .replace(/\n/g, ' ')
              .trim();
            cellContent = cellContent.replace(/\|/g, '\\|');
            return cellContent;
          });
          return '| ' + cellContents.join(' | ') + ' |';
        });

        if (!rows.length) return content;
        var separator = '| ' + Array(rows[0].split('|').length - 2).fill('---').join(' | ') + ' |';
        var tableContent = [rows[0], separator].concat(rows.slice(1)).join('\n');
        return '\n\n' + tableContent + '\n\n';
      }
    });

    turndownService.addRule('list', {
      filter: ['ul', 'ol'],
      replacement: function(content, node) {
        content = content.trim();
        var isTopLevel = !(node.parentNode && (node.parentNode.nodeName === 'UL' || node.parentNode.nodeName === 'OL'));
        return (isTopLevel ? '\n' : '') + content + '\n';
      }
    });

    turndownService.addRule('listItem', {
      filter: 'li',
      replacement: function(content, node, options) {
        if (!isElement(node)) return content;

        var isTaskListItem = node.classList && node.classList.contains('task-list-item');
        var checkbox = node.querySelector('input[type="checkbox"]');
        var taskListMarker = '';
        if (isTaskListItem && checkbox) {
          content = content.replace(/<input[^>]*>/, '');
          taskListMarker = checkbox.getAttribute('checked') ? '[x] ' : '[ ] ';
        }

        content = content.replace(/\n+$/, '').split('\n').filter(function(line) {
          return line.length > 0;
        }).join('\n\t');

        var level = 0;
        var current = node.parentNode;
        while (current && isElement(current)) {
          if (current.nodeName === 'UL' || current.nodeName === 'OL') {
            level++;
          } else if (current.nodeName !== 'LI') {
            break;
          }
          current = current.parentNode;
        }

        var indentLevel = Math.max(0, level - 1);
        var prefix = '\t'.repeat(indentLevel) + options.bulletListMarker + ' ';

        if (node.parentNode && node.parentNode.nodeName === 'OL') {
          var start = node.parentNode.getAttribute('start');
          var children = Array.from(node.parentNode.children || []);
          var index = 1;
          for (var i = 0; i < children.length; i++) {
            if (children[i] === node) { index = i + 1; break; }
          }
          prefix = '\t'.repeat(level - 1) + (start ? Number(start) + index - 1 : index) + '. ';
        }

        return prefix + taskListMarker + content.trim() + (node.nextSibling && !/\n$/.test(content) ? '\n' : '');
      }
    });

    turndownService.addRule('figure', {
      filter: 'figure',
      replacement: function(content, node) {
        if (!isElement(node)) return content;
        var img = node.querySelector('img');
        var figcaption = node.querySelector('figcaption');
        if (!img || !isElement(img)) return content;

        var hasPOut = Array.from(node.querySelectorAll('p')).some(function(p) {
          var ancestor = p.parentNode;
          while (ancestor && ancestor !== node) {
            if (ancestor.nodeName === 'FIGCAPTION') return false;
            ancestor = ancestor.parentNode;
          }
          return true;
        });
        if (hasPOut) return content;

        var alt = img.getAttribute('alt') || '';
        var src = getBestImageSrc(img);
        var caption = '';

        if (figcaption && isElement(figcaption)) {
          var tagSpan = figcaption.querySelector('.ltx_tag_figure');
          var tagText = tagSpan && isElement(tagSpan) ? (tagSpan.textContent || '').trim() : '';
          var captionHtml = figcaption.outerHTML;
          captionHtml = captionHtml.replace(/<math.*?>(.*?)<\/math>/g, function(match, mathContent) {
            var latex = '';
            var frag = parseHTML(match);
            var mathEl = frag.querySelector('math');
            if (mathEl && isElement(mathEl)) latex = extractLatex(mathEl);
            return '$' + latex + '$';
          });
          var captionMd = turndownService.turndown(captionHtml);
          caption = (tagText + ' ' + captionMd).trim();
        }

        caption = caption.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(match, text, href) {
          return '[' + text + '](' + href + ')';
        });

        return '![' + alt + '](' + src + ')\n\n' + caption + '\n\n';
      }
    });

    turndownService.addRule('image', {
      filter: 'img',
      replacement: function(content, node) {
        if (!isElement(node)) return content;
        var alt = node.getAttribute('alt') || '';
        var src = getBestImageSrc(node);
        var title = node.getAttribute('title') || '';
        var titlePart = title ? ' "' + title + '"' : '';
        return src ? '![' + alt + '](' + src + titlePart + ')' : '';
      }
    });

    turndownService.addRule('embedToMarkdown', {
      filter: function(node) {
        if (!isElement(node)) return false;
        var src = node.getAttribute('src');
        return !!src && (!!src.match(/(?:youtube\.com|youtube-nocookie\.com|youtu\.be)/) || !!src.match(/(?:twitter\.com|x\.com)/));
      },
      replacement: function(content, node) {
        if (!isElement(node)) return content;
        var src = node.getAttribute('src');
        if (src) {
          var yt = src.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be)\/(?:embed\/|watch\?v=)?([a-zA-Z0-9_-]+)/);
          if (yt && yt[1]) return '\n![](https://www.youtube.com/watch?v=' + yt[1] + ')\n';
          var tweetDirect = src.match(/(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([^/]+)\/status\/([0-9]+)/);
          if (tweetDirect) return '\n![](https://x.com/' + tweetDirect[1] + '/status/' + tweetDirect[2] + ')\n';
          var tweetEmbed = src.match(/(?:https?:\/\/)?(?:platform\.)?twitter\.com\/embed\/Tweet\.html\?.*?id=([0-9]+)/);
          if (tweetEmbed) return '\n![](https://x.com/i/status/' + tweetEmbed[1] + ')\n';
        }
        return content;
      }
    });

    turndownService.addRule('highlight', {
      filter: 'mark',
      replacement: function(content) {
        return '==' + content + '==';
      }
    });

    turndownService.addRule('strikethrough', {
      filter: function(node) {
        return node.nodeName === 'DEL' || node.nodeName === 'S' || node.nodeName === 'STRIKE';
      },
      replacement: function(content) {
        return '~~' + content + '~~';
      }
    });

    turndownService.addRule('complexLinkStructure', {
      filter: function(node, options) {
        return node.nodeName === 'A' && node.childNodes.length > 1 && Array.from(node.childNodes).some(function(child) {
          return ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].indexOf(child.nodeName) >= 0;
        });
      },
      replacement: function(content, node, options) {
        if (!isElement(node)) return content;
        var href = node.getAttribute('href');
        var title = node.getAttribute('title');
        var headingNode = node.querySelector('h1, h2, h3, h4, h5, h6');
        var headingContent = headingNode ? turndownService.turndown(headingNode.outerHTML) : '';
        if (headingNode) headingNode.remove();
        var remainingContent = turndownService.turndown(node.outerHTML);
        var md = headingContent + '\n\n' + remainingContent + '\n\n';
        if (href) {
          md += '[View original](' + href + ')';
          if (title) md += ' "' + title + '"';
        }
        return md;
      }
    });

    turndownService.addRule('arXivEnumerate', {
      filter: function(node) {
        return node.nodeName === 'OL' && isElement(node) && node.classList && node.classList.contains('ltx_enumerate');
      },
      replacement: function(content, node) {
        if (!isElement(node)) return content;
        var items = Array.from(node.children || []).map(function(item, index) {
          if (isElement(item)) {
            var itemContent = (item.outerHTML || '').replace(/^<span class="ltx_tag ltx_tag_item">\d+\.<\/span>\s*/, '');
            return (index + 1) + '. ' + turndownService.turndown(itemContent);
          }
          return '';
        });
        return '\n\n' + items.join('\n\n') + '\n\n';
      }
    });

    turndownService.addRule('citations', {
      filter: function(node) {
        if (isElement(node)) {
          var id = node.getAttribute('id');
          return node.nodeName === 'SUP' && id !== null && id.indexOf('fnref:') === 0;
        }
        return false;
      },
      replacement: function(content, node) {
        if (isElement(node)) {
          var id = node.getAttribute('id');
          if (node.nodeName === 'SUP' && id !== null && id.indexOf('fnref:') === 0) {
            var primaryNumber = id.replace('fnref:', '').split('-')[0];
            return '[^' + primaryNumber + ']';
          }
        }
        return content;
      }
    });

    turndownService.addRule('footnotesList', {
      filter: function(node) {
        if (isElement(node)) {
          var parent = node.parentNode;
          return node.nodeName === 'OL' && parent !== null && isElement(parent) && parent.getAttribute('id') === 'footnotes';
        }
        return false;
      },
      replacement: function(content, node) {
        if (!isElement(node)) return content;
        var refs = Array.from(node.children || []).map(function(li) {
          var id;
          if (isElement(li)) {
            var liId = li.getAttribute('id');
            if (liId !== null) {
              if (liId.indexOf('fn:') === 0) {
                id = liId.replace('fn:', '');
              } else {
                var match = liId.split('/').pop().match(/cite_note-(.+)/);
                id = match ? match[1] : liId;
              }
            }
            var sup = li.querySelector('sup');
            if (sup && isElement(sup) && (sup.textContent || '').trim() === id) sup.remove();
            var refContent = turndownService.turndown(li.outerHTML);
            var cleaned = refContent.replace(/\s*↩︎$/, '').trim();
            return '[^' + (id ? id.toLowerCase() : '') + ']: ' + cleaned;
          }
          return '';
        });
        return '\n\n' + refs.join('\n\n') + '\n\n';
      }
    });

    turndownService.addRule('removals', {
      filter: function(node) {
        if (!isElement(node)) return false;
        if (node.getAttribute('href') && node.getAttribute('href').indexOf('#fnref') >= 0) return true;
        if (node.classList && node.classList.contains('footnote-backref')) return true;
        return false;
      },
      replacement: function(content, node) {
        return '';
      }
    });

    turndownService.addRule('handleTextNodesInTables', {
      filter: function(node) {
        return isTextNode(node) && node.parentNode !== null && node.parentNode.nodeName === 'TD';
      },
      replacement: function(content) {
        return content;
      }
    });

    turndownService.addRule('preformattedCode', {
      filter: function(node) {
        return node.nodeName === 'PRE';
      },
      replacement: function(content, node) {
        if (!isElement(node)) return content;
        var codeElement = node.querySelector('code');
        if (!codeElement || !isElement(codeElement)) return content;
        var classAttr = codeElement.getAttribute('class') || '';
        var langMatch = classAttr.match(/language-(\w+)/);
        var language = codeElement.getAttribute('data-lang') || codeElement.getAttribute('data-language') || (langMatch ? langMatch[1] : '') || node.getAttribute('data-language') || '';
        var code = codeElement.textContent || '';
        var cleanCode = code.trim().replace(/`/g, '\\`');
        return '\n```' + language + '\n' + cleanCode + '\n```\n';
      }
    });

    turndownService.addRule('math', {
      filter: function(node) {
        return node.nodeName.toLowerCase() === 'math' || (isElement(node) && node.classList && (node.classList.contains('mwe-math-element') || node.classList.contains('mwe-math-fallback-image-inline') || node.classList.contains('mwe-math-fallback-image-display')));
      },
      replacement: function(content, node) {
        if (!isElement(node)) return content;
        var latex = extractLatex(node);
        latex = latex.trim();

        var isInTable = typeof node.closest === 'function' ? node.closest('table') !== null : false;
        var display = node.getAttribute('display');

        if (!isInTable && (display === 'block' || node.classList.contains('mwe-math-fallback-image-display') || (node.parentNode && isElement(node.parentNode) && node.parentNode.classList.contains('mwe-math-element') && node.parentNode.previousSibling && isElement(node.parentNode.previousSibling) && node.parentNode.previousSibling.nodeName.toLowerCase() === 'p'))) {
          return '\n$$\n' + latex + '\n$$\n';
        } else {
          var prevNode = node.previousSibling;
          var nextNode = node.nextSibling;
          var prevChar = prevNode ? (isElement(prevNode) ? (prevNode.textContent || '').slice(-1) : (prevNode.nodeValue || '').slice(-1)) : '';
          var nextChar = nextNode ? (isElement(nextNode) ? (nextNode.textContent || '')[0] : (nextNode.nodeValue || '')[0]) : '';
          var isStart = !prevNode || (isTextNode(prevNode) && (prevNode.nodeValue || '').trim() === '');
          var isEnd = !nextNode || (isTextNode(nextNode) && (nextNode.nodeValue || '').trim() === '');
          var leftSpace = (!isStart && prevChar && !/[\s$]/.test(prevChar)) ? ' ' : '';
          var rightSpace = (!isEnd && nextChar && !/[\s$]/.test(nextChar)) ? ' ' : '';
          return leftSpace + '$' + latex + '$' + rightSpace;
        }
      }
    });

    turndownService.addRule('katex', {
      filter: function(node) {
        return isElement(node) && node.classList && (node.classList.contains('math') || node.classList.contains('katex'));
      },
      replacement: function(content, node) {
        if (!isElement(node)) return content;
        var latex = node.getAttribute('data-latex');
        if (!latex) {
          var mathml = node.querySelector('.katex-mathml annotation[encoding="application/x-tex"]');
          latex = mathml && isElement(mathml) ? (mathml.textContent || '') : '';
        }
        if (!latex) latex = (node.textContent || '').trim();
        var mathEl = node.querySelector('.katex-mathml math');
        var isInline = node.classList.contains('math-inline') || (mathEl && isElement(mathEl) && mathEl.getAttribute('display') !== 'block');
        if (isInline) return '$' + latex + '$';
        return '\n$$\n' + latex + '\n$$\n';
      }
    });

    turndownService.addRule('callout', {
      filter: function(node) {
        return isElement(node) && !!node.getAttribute('data-callout') && node.classList.contains('callout');
      },
      replacement: function(content, node) {
        if (!isElement(node)) return content;
        var type = node.getAttribute('data-callout') || 'note';
        var fold = node.getAttribute('data-callout-fold');
        var foldIndicator = fold === '-' || fold === '+' ? fold : '';
        var titleInner = node.querySelector('.callout-title-inner');
        var title = (titleInner && titleInner.textContent) ? titleInner.textContent.trim() : type.charAt(0).toUpperCase() + type.slice(1);
        var titleDiv = node.querySelector('.callout-title');
        if (titleDiv) titleDiv.remove();
        var contentEl = node.querySelector('.callout-content');
        var calloutContent = contentEl ? turndownService.turndown(contentEl.innerHTML) : turndownService.turndown(node.innerHTML);
        var lines = calloutContent.trim().split('\n');
        var quotedContent = lines.map(function(line) { return '> ' + line; }).join('\n');
        return '\n\n> [!' + type + ']' + foldIndicator + ' ' + title + '\n' + quotedContent + '\n\n';
      }
    });

    turndownService.addRule('button', {
      filter: 'button',
      replacement: function(content) {
        return content;
      }
    });

    turndownService.remove(['style', 'script']);
    turndownService.keep(['iframe', 'video', 'audio', 'sup', 'sub', 'svg', 'math']);

    // === Process ===

    htmlString = htmlString.replace(/<wbr\s*\/?>/gi, '');

    var markdown = turndownService.turndown(htmlString);

    // Remove first h1 heading
    var titleMatch = markdown.match(/^# .+\n+/);
    if (titleMatch) {
      markdown = markdown.slice(titleMatch[0].length);
    }

    // Remove empty []() links, preserve ![]() images
    markdown = markdown.replace(/\n*(?<!!)\[]\([^)]+\)\n*/g, '');

    // Insert space between ! and ![
    markdown = markdown.replace(/!(?=!\[|\[!\[)/g, '! ');

    // Collapse consecutive newlines to max 2
    markdown = markdown.replace(/\n{3,}/g, '\n\n');

    return markdown.trim();
  };
})();
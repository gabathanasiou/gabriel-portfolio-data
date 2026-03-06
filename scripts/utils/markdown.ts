
// Simple Markdown Parser for Airtable Rich Text
export const parseMarkdown = (markdown: string) => {
    if (!markdown) return '';
    
    let html = markdown;

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');
    html = html.replace(/_(.*?)_/gim, '<em>$1</em>');

    // Links
    html = html.replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // Lists (Unordered)
    html = html.replace(/^\s*-\s+(.*)/gim, '<ul><li>$1</li></ul>');
    // Fix consecutive lists
    html = html.replace(/<\/ul>\s*<ul>/gim, '');

    // Blockquotes
    html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

    // Line breaks into paragraphs
    const paragraphs = html.split(/\n\s*\n/);
    html = paragraphs.map(p => {
        // Wrap in <p> if it's not already a header or list
        if (!p.match(/^<(h|ul|blockquote)/)) {
            return `<p>${p.replace(/\n/g, '<br>')}</p>`;
        }
        return p;
    }).join('');

    return html;
};

// src/validation/utils/latex-stripper.ts
// LaTeX → plain text extraction for keyword matching and format validation.

export function stripLatexCommands(text: string): string {
  return text
    .replace(/\\textbf\{([^}]*)\}/g, "$1")
    .replace(/\\textit\{([^}]*)\}/g, "$1")
    .replace(/\\emph\{([^}]*)\}/g, "$1")
    .replace(/\\resumeItem\{([^}]*)\}/g, "$1")
    .replace(/\\resumeSubHeadingListStart|\\resumeSubHeadingListEnd/g, "")
    .replace(/\\resumeItemListStart|\\resumeItemListEnd/g, "")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/\\\\/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\s+/g, " ");
}

export function stripAllLatex(text: string): string {
  return text
    .replace(/^[\s\S]*?\\begin\{document\}/i, "")
    .replace(/\\end\{document\}[\s\S]*$/i, "")
    .replace(/\\section\*?\{([^}]*)\}/g, "\n$1\n")
    .replace(/\\subsection\*?\{([^}]*)\}/g, "\n$1\n")
    .replace(/\\textbf\{([^}]*)\}/g, "$1")
    .replace(/\\textit\{([^}]*)\}/g, "$1")
    .replace(/\\emph\{([^}]*)\}/g, "$1")
    .replace(/\\underline\{([^}]*)\}/g, "$1")
    .replace(/\\small\{([^}]*)\}/g, "$1")
    .replace(/\\large\{([^}]*)\}/g, "$1")
    .replace(/\\resumeItem\{([^}]*)\}/g, "\u2022 $1")
    .replace(
      /\\resumeSubheading\s*\[[^\]]*\]\s*\{([^}]*)}\{([^}]*)}\{([^}]*)}\{([^}]*)\}/g,
      "$1 \u2014 $2 | $3 $4",
    )
    .replace(
      /\\resumeSubheading\{([^}]*)}\{([^}]*)}\{([^}]*)}\{([^}]*)\}/g,
      "$1 \u2014 $2 | $3 $4",
    )
    .replace(/\\resumeSubHeadingListStart|\\resumeSubHeadingListEnd/g, "")
    .replace(/\\resumeItemListStart|\\resumeItemListEnd/g, "")
    .replace(/\\begin\{itemize\}|\\end\{itemize\}/g, "")
    .replace(/\\item\s/g, "\u2022 ")
    .replace(/\\[a-zA-Z]+(\{[^}]*\})*/g, " ")
    .replace(/[{}&$#%~]/g, " ")
    .replace(/\\\\/g, "\n")
    .replace(/\\\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .trim();
}

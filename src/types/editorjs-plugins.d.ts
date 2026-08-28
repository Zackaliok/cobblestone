/**
 * Certains tools Editor.js ne publient pas de déclarations TypeScript.
 * Ils sont passés à Editor.js comme constructeurs opaques ; on n'a besoin
 * d'aucun typage précis, seulement de l'existence du module.
 */
declare module '@editorjs/marker' {
  const Marker: unknown;
  export default Marker;
}

declare module '@editorjs/delimiter' {
  const Delimiter: unknown;
  export default Delimiter;
}

declare module '@editorjs/inline-code' {
  const InlineCode: unknown;
  export default InlineCode;
}

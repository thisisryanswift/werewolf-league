// Stylesheets imported by components are bundled by Vite.
declare module "*.css";
// Text imported with ?raw (the help copy in docs/help) is bundled as a string.
declare module "*?raw" {
  const text: string;
  export default text;
}

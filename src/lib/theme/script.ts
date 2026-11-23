/**
 * Runs in <head> before the page paints, so dark mode never flashes white.
 * Perqly is light unless the person turns on dark mode in Account; the choice is saved on this device.
 * The phone's own dark setting is ignored, so everyone gets the white app by default.
 * Also marks low-memory phones and data saver with data-lite="1", so glass effects stay light there.
 * Kept tiny and dependency-free: it's inlined as a string.
 */
export const THEME_STORAGE_KEY = "perqly-theme";
// The same as the page background (--color-paper), so the phone's status bar blends into the app.
export const THEME_COLORS = { light: "#FFFFFF", dark: "#0B1220" } as const;

export const themeScript = `(function(){try{
var k=${JSON.stringify(THEME_STORAGE_KEY)},c=${JSON.stringify(THEME_COLORS)};
var p=localStorage.getItem(k)==="dark"?"dark":"light";
function apply(){var d=p==="dark";var r=document.documentElement;
r.dataset.theme=d?"dark":"light";r.dataset.themeChoice=p;
document.querySelectorAll('meta[name="theme-color"]').forEach(function(t){
if(t.dataset.fixed==="1")return;var v=(t.getAttribute("content")||"").toLowerCase();
if(v==="#000000"){t.dataset.fixed="1";return;}
t.removeAttribute("media");t.setAttribute("content",d?c.dark:c.light);});}
var n=navigator,cn=n.connection;if((n.deviceMemory&&n.deviceMemory<=2)||(n.hardwareConcurrency&&n.hardwareConcurrency<=4)||(cn&&cn.saveData))document.documentElement.dataset.lite="1";
apply();
window.__perqlyTheme=function(n){p=n;try{localStorage.setItem(k,n)}catch(e){}apply();};
}catch(e){}})();`;

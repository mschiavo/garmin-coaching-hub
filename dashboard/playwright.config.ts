import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests',testMatch:'**/*.spec.ts',testIgnore:'**/supabase.integration.spec.ts',timeout:90000,workers:1,
 use:{baseURL:'http://127.0.0.1:4179',browserName:'chromium',trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:[
  {command:'npm run dev -- --host 127.0.0.1 --port 4179 --strictPort',env:{VITE_SUPABASE_URL:'https://analytics-fixture.invalid',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic'},url:'http://127.0.0.1:4179/tests/fixture.html',reuseExistingServer:false,timeout:60000},
  {command:'npm run preview -- --host 127.0.0.1 --port 4180 --strictPort',url:'http://127.0.0.1:4180/',reuseExistingServer:false,timeout:60000}
 ],
 projects:[{name:'desktop',use:{viewport:{width:1280,height:900}}},{name:'mobile',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}}]
});

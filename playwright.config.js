import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',timeout:90000,use:{baseURL:'http://localhost:4173/WaterModelling/',headless:true},webServer:{command:'npm run serve',port:4173,reuseExistingServer:!process.env.CI},reporter:'list'});

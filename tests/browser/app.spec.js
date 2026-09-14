import {test,expect} from '@playwright/test';
test('desktop workflow, local worker, numeric exports and scenario import',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.goto('./');await page.getByRole('button',{name:'Coba demo sintetis'}).click();
 await page.getByRole('button',{name:'Jalankan simulasi'}).click();
 await expect(page.locator('#resultContent')).toBeVisible({timeout:60000});
 await expect(page.locator('#quality')).toContainText('SINTETIS');
 await page.locator('#probeLat').fill('-5.1');await page.locator('#probeLon').fill('119.3');await page.locator('#probeGo').click();await expect(page.locator('#probeStats')).toContainText('maksimum');
 await page.locator('#probeLon').fill('119.306');await page.locator('#probeGo').click();await expect(page.locator('#probeLabel')).toContainText('NoData');
 for(const [id,suffix] of [['exportGeo','.geojson'],['exportTif','.zip'],['exportKml','.kmz'],['save','.json']]){
 const dl=page.waitForEvent('download');await page.locator('#'+id).click();expect((await dl).suggestedFilename()).toContain(suffix);
 }
 const download=page.waitForEvent('download');await page.locator('#save').click();const saved=await download;await page.locator('#scenarioFile').setInputFiles(await saved.path());await expect(page.locator('#notice')).toContainText('Input skenario dimuat');
 expect(errors).toEqual([]);
});
test('mobile has no horizontal overflow and blocks absent water mask',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.route('https://tile.openstreetmap.org/**',r=>r.abort());await page.goto('./');
 await page.locator('#run').click();await expect(page.locator('#notice')).toContainText('poligon air');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#help').click();await expect(page.locator('#helpDialog')).toBeVisible();await page.locator('#closeHelp').click();
});
test('API null currents never silently become zeros',async({page})=>{
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.route('https://marine-api.open-meteo.com/**',r=>r.fulfill({json:{hourly:{time:[0,3600],ocean_current_velocity:[null,null],ocean_current_direction:[null,null]},hourly_units:{ocean_current_velocity:'m/s'},latitude:0,longitude:0}}));
 await page.route('https://api.open-meteo.com/**',r=>r.fulfill({json:{hourly:{time:[],wind_speed_10m:[],wind_direction_10m:[]},hourly_units:{wind_speed_10m:'m/s'}}}));
 await page.goto('./');await page.locator('#gather').click();await expect(page.locator('#dataStatus')).toHaveClass(/error/);await expect(page.locator('#resultContent')).toBeHidden();
});

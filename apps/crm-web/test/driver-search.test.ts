import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesDriverSearch} from '../src/pages/driver-search.js';
test('driver can be found by plate with spaces or Cyrillic letters while name and phone search still work',()=>{
 const driver={fullName:'Fixture Driver',phone:'0555123456'};
 const plates=['01KG666ASA'];
 for(const query of ['666','01 kg 666 asa','666 АSА','fixture','123456']) assert.equal(matchesDriverSearch(driver,query,plates),true,query);
 assert.equal(matchesDriverSearch(driver,'777',plates),false);
 assert.equal(matchesDriverSearch(driver,'666',[]),false);
});

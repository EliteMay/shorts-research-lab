import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDiscovery,validateSelection,buildApprovedReview} from '../review/review-model.mjs';
const fixture={provider:'Wikimedia Commons',scenes:[{sceneIndex:0,sceneId:'cat',narration:'猫が寝ている',candidates:[{
 title:'File:Cat.jpg',imageUrl:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Cat.jpg',
 sourcePage:'https://commons.wikimedia.org/wiki/File:Cat.jpg',rightsStatus:'needs-human-license-review',license:'CC BY 4.0',creator:'Author'
}]}]};
const item={index:0,rightsReviewed:true,visualMatchesNarration:true,humanApproved:true,credit:'Author',licenseSnapshot:'確認日2026-10-15'};
test('valid candidate JSON loads without auto-approval',()=>{const d=parseDiscovery(fixture);assert.equal(d.scenes[0].candidates.length,1);assert.ok(validateSelection(d,[]).length);});
test('deny external image domains',()=>{const d=structuredClone(fixture);d.scenes[0].candidates[0].imageUrl='https://upload.wikimedia.org.attacker.test/a.jpg';assert.equal(parseDiscovery(d).scenes[0].candidates.length,0);});
test('do not export until every right and visual review is explicit',()=>{const d=parseDiscovery(fixture);assert.ok(validateSelection(d,[{...item,humanApproved:false}]).length);assert.ok(validateSelection(d,[{...item,rightsReviewed:false}]).length);assert.ok(validateSelection(d,[{...item,visualMatchesNarration:false}]).length);});
test('approved output matches stage-reviewed selection contract',()=>{const d=parseDiscovery(fixture);const out=buildApprovedReview(d,[item]);assert.deepEqual(out.map(o=>o.sceneIndex),[0]);assert.equal(out[0].humanApproved,true);assert.equal(out[0].imageUrl,fixture.scenes[0].candidates[0].imageUrl);});
test('ineligible license is not approved by checkbox',()=>{const raw=structuredClone(fixture);raw.scenes[0].candidates[0].rightsStatus='not-eligible-by-license-allowlist';assert.throws(()=>buildApprovedReview(parseDiscovery(raw),[item]));});
test('reject malformed and oversized scene collections',()=>{assert.throws(()=>parseDiscovery({provider:'X',scenes:[]}));assert.throws(()=>parseDiscovery({...fixture,scenes:Array(21).fill(fixture.scenes[0])}));});
test('avoid duplicate scene IDs',()=>{const x=structuredClone(fixture);x.scenes.push({...x.scenes[0],sceneIndex:1});assert.throws(()=>parseDiscovery(x));});
test('missing creator credits cannot be saved',()=>{const d=parseDiscovery(fixture);assert.ok(validateSelection(d,[{...item,credit:''}]).length);});

import {describe,it,expect} from 'vitest';
import {resolveSiteType} from '../lib/audit/site-type.js';
import {validateAgentInput} from '../lib/agent/input.js';
const pages=[{url:'https://agency.example/',text:'Shopify ecommerce design shipping returns shop',links:['/cart']}];
describe('website scope',()=>{
 it('never adds ecommerce based on marketing copy or schema',()=>expect(resolveSiteType([{...pages[0],links:[],schema:{type:'Product'}}]).ecommerce.applicable).toBe(false));
 it('flags transactional links for review without enabling scores',()=>expect(resolveSiteType(pages).ecommerce).toMatchObject({applicable:false,status:'needs_review'}));
 it('honors explicit exclusion even with store type and cart links',()=>expect(resolveSiteType(pages,{websiteType:'ecommerce',ecommerceFunctionality:'no'}).ecommerce).toMatchObject({applicable:false,status:'not_applicable'}));
 it('supports corporate websites with a store',()=>expect(resolveSiteType([],{websiteType:'corporate',ecommerceFunctionality:'yes'}).ecommerce.applicable).toBe(true));
 it('includes a declared ecommerce store',()=>expect(resolveSiteType([],{websiteType:'ecommerce'}).ecommerce.applicable).toBe(true));
 it('does not flag external portfolio links as a checkout',()=>expect(resolveSiteType([{url:'https://agency.example',links:['https://client.example/cart']}]).ecommerce.evidence).toEqual([]));
 it('preserves scope in agent requests and rejects invalid values',()=>{expect(validateAgentInput({url:'https://example.com',websiteType:'marketing',ecommerceFunctionality:'no'})).toMatchObject({websiteType:'marketing',ecommerceFunctionality:'no'});expect(()=>validateAgentInput({url:'https://example.com',websiteType:'invalid'})).toThrow();});
});

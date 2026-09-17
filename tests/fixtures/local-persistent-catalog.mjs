// Synthetic test setup only; never imported by application sources.
export const ids = Object.fromEntries(['category','product','variant','option','value','fulfillment','config','field','shipping','coupon'].map((k,i)=>[k,`41000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]));
export function catalogTestEnvironment(overrides={}) {
  return {NODE_ENV:'test',LOCAL_COMMERCE_ENVIRONMENT:'test',LOCAL_COMMERCE_PROJECT_KIND:'disposable_test',
    APP_DEPLOYMENT_ENV:'test',NEXT_PUBLIC_DEPLOYMENT_ORIGIN:'http://localhost:3000',
    LOCAL_COMMERCE_PROJECT_ID:'figmemento-local-commerce-test-run-ab12cd34',LOCAL_COMMERCE_RUN_ID:'run-ab12cd34',
    LOCAL_COMMERCE_DB_MAJOR_VERSION:'17',LOCAL_COMMERCE_SHADOW_DB_PORT:'55420',LOCAL_COMMERCE_API_PORT:'55421',
    LOCAL_COMMERCE_DB_PORT:'55422',LOCAL_COMMERCE_STUDIO_PORT:'55423',LOCAL_COMMERCE_SMTP_PORT:'55424',
    LOCAL_COMMERCE_IMAGE_HELPER_PORT:'55425',LOCAL_COMMERCE_IMAGE_HELPER_URL:'http://127.0.0.1:55425',
    LOCAL_COMMERCE_API_URL:'http://127.0.0.1:55421',LOCAL_COMMERCE_RPC_URL:'http://127.0.0.1:55421',
    LOCAL_COMMERCE_STORAGE_URL:'http://127.0.0.1:55421/storage/v1',LOCAL_COMMERCE_MARKER_DIGEST:'a'.repeat(64),
    LOCAL_COMMERCE_SERVICE_ROLE_KEY:'offline-sentinel-not-a-credential',
    LOCAL_COMMERCE_IMAGE_HELPER_SECRET:'a'.repeat(43),
    LOCAL_ORDER_CAPABILITY_SECRET:'ab'.repeat(32),LOCAL_ORDER_CAPABILITY_TTL_SECONDS:'3600',
    PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET:'guest-owner-secret-value-never-public-123',
    PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS:'3600',
    PHOTOGIFT_PRODUCT_SOURCE:'local_persistent',...overrides};
}
export function catalogDatabaseRows(projectId=catalogTestEnvironment().LOCAL_COMMERCE_PROJECT_ID) {
  const row=(id)=>({project_id:projectId,id,version:1,lifecycle:'active'});
  return {projectId,
    categories:[{...row(ids.category),slug:'synthetic-keepsakes',name:'Synthetic keepsakes',description:'Test category',publication_status:'published'}],
    products:[{...row(ids.product),category_id:ids.category,slug:'synthetic-keepsake',name:'Synthetic keepsake',description:'Test product',publication_status:'published',availability:'available',
      option_definitions:[{id:ids.option,productId:ids.product,code:'size',name:'Size',kind:'size',required:true,position:0}],
      option_value_definitions:[{id:ids.value,productId:ids.product,optionId:ids.option,code:'small',label:'Small',position:0}],asset_definitions:[],
      fulfillment_definition:{id:ids.fulfillment,productId:ids.product,fulfillmentType:'physical',requiresShipping:true,productionMode:'custom_manufacturing',leadTime:{minBusinessDays:2,maxBusinessDays:4}}}],
    variants:[{...row(ids.variant),product_id:ids.product,sku_code:'SYNTHETIC-KEEPSAKE-S',selected_options:[{optionId:ids.option,valueId:ids.value}],price_cents:2500,currency:'USD',availability:'available',weight_grams:50,is_default:true,supply_method:'made_to_order'}],
    configurations:[{...row(ids.config),product_id:ids.product,revision:1,configuration_status:'active',definition:{productId:ids.product,configurationRevision:'1',fields:[{id:ids.field,productId:ids.product,code:'caption',label:'Caption',kind:'short_text',required:false,isActive:true,position:0,configurationRevision:'1',constraints:{maxLength:80}}]}}],
    rules:[{...row(ids.shipping),rule_key:'shipping-us-standard',revision:1,rule_status:'active',definition:{kind:'shipping',ruleRevision:1,country:'US',method:'local_standard',currency:'USD',eligible:true,amountCents:500,minSubtotalCents:0,minDisplayDays:5,maxDisplayDays:10}},
      {...row(ids.coupon),rule_key:'coupon-test',revision:1,rule_status:'active',definition:{kind:'coupon',ruleRevision:1,code:'TEST10',currency:'USD',eligible:true,minSubtotalCents:1000,validFrom:'2026-01-01T00:00:00Z',expiresAt:'2027-01-01T00:00:00Z',discountType:'percent',discountValue:10}}]};
}
export function offlineCatalogClient(rows=catalogDatabaseRows(), options={}) {
  const calls=[];
  return {calls,create(){calls.push('construct');return {schema(name){if(name!=='local_commerce')throw Error('wrong schema');return {async rpc(name,args){calls.push({name,args});
    if(options.outage)return {error:{message:'private sentinel'},data:null};
    if(name==='verify_project_identity')return {error:null,data:!options.badMarker && args.p_project_id===rows.projectId && args.p_marker_digest==='a'.repeat(64)};
    if(name==='read_catalog_authority')return {error:null,data:structuredClone(rows)};
    throw Error('Unexpected RPC');
  }};}};}};
}

// Explicit integration check against a running local server. Creates two disposable
// test accounts and deletes only those accounts (and their cascaded test records).
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import postgres from 'postgres';
const origin=process.env.TEST_BASE_URL??'http://localhost:3020';
const sql=postgres(process.env.NEON_DATABASE_URL,{ssl:'require',max:1});
const accounts=[];
async function request(path,body,method='GET',cookie=''){
 const res=await fetch(origin+'/api/'+path,{method,headers:{'content-type':'application/json',origin,cookie},...(method==='GET'?{}:{body:JSON.stringify(body)})});return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
}
try{
 const a=await request('auth',{action:'register',email:`firstrep-test-${randomUUID()}@example.invalid`,password:randomUUID(),display_name:'Library integration test'},'POST');assert.equal(a.status,200);accounts.push(a.body.user.id);
 const b=await request('auth',{action:'register',email:`firstrep-test-${randomUUID()}@example.invalid`,password:randomUUID(),display_name:'Ownership integration test'},'POST');assert.equal(b.status,200);accounts.push(b.body.user.id);
 assert.equal((await request('library/workouts')).status,401);
 assert.equal((await request('library/favorites',{exerciseId:'bench',favorite:true},'PUT',a.cookie)).status,200);
 await request('library/favorites',{exerciseId:'bench',favorite:true},'PUT',a.cookie);
 assert.deepEqual((await request('library/favorites',undefined,'GET',a.cookie)).body.favorites,['bench']);
 assert.deepEqual((await request('library/favorites',undefined,'GET',b.cookie)).body.favorites,[]);
 const body={name:'Upper Body Strength',description:'Integration test',exercises:[{exerciseId:'bench',sets:4,mode:'reps',reps:'6-8',duration:30,weight:60,rest:120,notes:'Controlled descent'},{exerciseId:'plank',sets:3,mode:'duration',reps:'10',duration:45,weight:null,rest:45,notes:''}]};
 let created=await request('library/workouts',body,'POST',a.cookie);assert.equal(created.status,200,JSON.stringify(created.body));let w=created.body.workout;
 const id=w.id;assert.equal((await request(`library/workouts/${id}`,undefined,'GET',b.cookie)).status,404);
 assert.equal((await request(`library/workouts/${id}`,{...body,updatedAt:w.updatedAt},'PUT',b.cookie)).status,404);
 assert.equal((await request(`library/workouts/${id}`,{favorite:true},'PATCH',b.cookie)).status,404);
 assert.equal((await request(`library/workouts/${id}`,{},'DELETE',b.cookie)).status,404);
 assert.equal((await request('library/workouts',{...body,exercises:[{...body.exercises[0],exerciseId:'missing'}]},'POST',a.cookie)).status,400);
 const updated=await request(`library/workouts/${id}`,{...body,name:'Upper Body Strength revised',exercises:[body.exercises[1],body.exercises[0]],updatedAt:w.updatedAt},'PUT',a.cookie);assert.equal(updated.status,200,JSON.stringify(updated.body));
 assert.equal(updated.body.workout.id,id);assert.equal(updated.body.workout.exercises[0].exerciseId,'plank');
 assert.equal((await request(`library/workouts/${id}`,{...body,updatedAt:w.updatedAt},'PUT',a.cookie)).status,409);
 await request(`library/workouts/${id}`,{favorite:true},'PATCH',a.cookie);
 const fresh=(await request('library/workouts',undefined,'GET',a.cookie)).body.workouts;assert.equal(fresh.length,1);assert.equal(fresh[0].favorite,true);assert.equal(fresh[0].exercises[1].weight,60);
 const copy=await request('library/workouts',{...fresh[0],name:'Independent copy'},'POST',a.cookie);assert.equal(copy.status,200);assert.notEqual(copy.body.workout.id,id);
 assert.equal((await request(`library/workouts/${copy.body.workout.id}`,{},'DELETE',a.cookie)).status,200);
 assert.equal((await request(`library/workouts/${copy.body.workout.id}`,undefined,'GET',a.cookie)).status,404);
 assert.equal((await request('library/workouts',undefined,'GET',a.cookie)).body.workouts.length,1);
 await request('library/favorites',{exerciseId:'bench',favorite:false},'PUT',a.cookie);assert.equal((await request('library/favorites',undefined,'GET',a.cookie)).body.favorites.length,0);
 const cross=await fetch(origin+'/api/library/workouts',{method:'POST',headers:{origin:'https://foreign.example','content-type':'application/json',cookie:a.cookie},body:JSON.stringify(body)});assert.equal(cross.status,403);
 const upstream='3_4_Sit-Up';
 const filtered=await request('exercises?muscle=abdominals&search=3%2F4');
 assert.equal(filtered.status,200);
 assert.ok(filtered.body.exercises.some((exercise)=>exercise.id===upstream));
 assert.equal((await request('library/favorites',{exerciseId:upstream,favorite:true},'PUT',a.cookie)).status,200);
 assert.ok((await request('library/favorites',undefined,'GET',a.cookie)).body.favorites.includes(upstream));
 const upstreamWorkout=await request('library/workouts',{name:'Upstream integration',exercises:[{...body.exercises[0],exerciseId:upstream}]},'POST',a.cookie);
 assert.equal(upstreamWorkout.status,200,JSON.stringify(upstreamWorkout.body));
 assert.equal(upstreamWorkout.body.workout.exercises[0].exerciseId,upstream);
 assert.equal((await request(`library/workouts/${upstreamWorkout.body.workout.id}`,{},'DELETE',a.cookie)).status,200);
 assert.equal((await request('library/favorites',{exerciseId:upstream,favorite:false},'PUT',a.cookie)).status,200);
 console.log('PASS: authenticated favorites and saved workouts with legacy and upstream exercise IDs, persistence, editing, isolation, validation, and origin protection.');
}finally{for(const id of accounts)await sql`DELETE FROM firstrep_users WHERE id=${id}`;await sql.end();}

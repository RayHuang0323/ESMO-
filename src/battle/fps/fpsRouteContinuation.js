const near=(a,b)=>Boolean(a&&b&&Math.hypot(a.x-b.x,a.y-b.y)<=0.75);

// Progress is earned only by reaching authored anchors, never by proximity to
// the final site. A stage can append a site without replaying its approach.
export function advanceFpsAuthoredRoute(plan,reached){
  if(!plan?.keys||plan.keys.length!==plan.points?.length)return;
  let cursor=plan.completedIntentCount||0;
  while(cursor<plan.points.length&&near(reached,plan.points[cursor]))cursor++;
  plan.completedIntentCount=cursor;
}

export function continueFpsAuthoredRoute(previous,points,keys,{roundReset=false}={}){
  if(roundReset||!previous?.keys||!keys||keys.length!==points.length||previous.keys.length!==previous.points?.length)return 0;
  let shared=0;
  const earned=Math.min(previous.completedIntentCount||0,previous.keys.length);
  while(shared<earned&&shared<keys.length&&keys[shared]===previous.keys[shared]&&near(points[shared],previous.points[shared]))shared++;
  return shared;
}

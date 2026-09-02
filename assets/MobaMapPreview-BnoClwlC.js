import{aC as ct,aD as dt,aE as De,aF as Le,ar as ae,aG as ut,i as Fe,az as Ze,k as Y,aH as ft,aI as Te,aJ as We,w as et,ac as pt,aK as ue,aL as ht,K as tt,ak as mt,r as _,u as Re,x as xt,aM as He,aN as de,aO as le,aP as be,aQ as bt,aR as Ie,aS as gt,aT as yt,aU as wt,j as n,C as vt,aV as Mt,A as jt,aW as G,aX as oe,aY as V,aZ as _t,a9 as St,Q as kt,a_ as Me,a$ as Ce,n as nt}from"./index-QEqSKHli.js";import{O as Et}from"./OrbitControls-BDV077Tb.js";const st=parseInt(ct.replace(/\D+/g,"")),ot=st>=125?"uv1":"uv2",Ne=new Fe,ge=new Y;class Pe extends dt{constructor(){super(),this.isLineSegmentsGeometry=!0,this.type="LineSegmentsGeometry";const e=[-1,2,0,1,2,0,-1,1,0,1,1,0,-1,0,0,1,0,0,-1,-1,0,1,-1,0],t=[-1,2,1,2,-1,1,1,1,-1,-1,1,-1,-1,-2,1,-2],r=[0,2,1,2,3,1,2,4,3,4,5,3,4,6,5,6,7,5];this.setIndex(r),this.setAttribute("position",new De(e,3)),this.setAttribute("uv",new De(t,2))}applyMatrix4(e){const t=this.attributes.instanceStart,r=this.attributes.instanceEnd;return t!==void 0&&(t.applyMatrix4(e),r.applyMatrix4(e),t.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}setPositions(e){let t;e instanceof Float32Array?t=e:Array.isArray(e)&&(t=new Float32Array(e));const r=new Le(t,6,1);return this.setAttribute("instanceStart",new ae(r,3,0)),this.setAttribute("instanceEnd",new ae(r,3,3)),this.computeBoundingBox(),this.computeBoundingSphere(),this}setColors(e,t=3){let r;e instanceof Float32Array?r=e:Array.isArray(e)&&(r=new Float32Array(e));const s=new Le(r,t*2,1);return this.setAttribute("instanceColorStart",new ae(s,t,0)),this.setAttribute("instanceColorEnd",new ae(s,t,t)),this}fromWireframeGeometry(e){return this.setPositions(e.attributes.position.array),this}fromEdgesGeometry(e){return this.setPositions(e.attributes.position.array),this}fromMesh(e){return this.fromWireframeGeometry(new ut(e.geometry)),this}fromLineSegments(e){const t=e.geometry;return this.setPositions(t.attributes.position.array),this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Fe);const e=this.attributes.instanceStart,t=this.attributes.instanceEnd;e!==void 0&&t!==void 0&&(this.boundingBox.setFromBufferAttribute(e),Ne.setFromBufferAttribute(t),this.boundingBox.union(Ne))}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Ze),this.boundingBox===null&&this.computeBoundingBox();const e=this.attributes.instanceStart,t=this.attributes.instanceEnd;if(e!==void 0&&t!==void 0){const r=this.boundingSphere.center;this.boundingBox.getCenter(r);let s=0;for(let o=0,l=e.count;o<l;o++)ge.fromBufferAttribute(e,o),s=Math.max(s,r.distanceToSquared(ge)),ge.fromBufferAttribute(t,o),s=Math.max(s,r.distanceToSquared(ge));this.boundingSphere.radius=Math.sqrt(s),isNaN(this.boundingSphere.radius)&&console.error("THREE.LineSegmentsGeometry.computeBoundingSphere(): Computed radius is NaN. The instanced position data is likely to have NaN values.",this)}}toJSON(){}applyMatrix(e){return console.warn("THREE.LineSegmentsGeometry: applyMatrix() has been renamed to applyMatrix4()."),this.applyMatrix4(e)}}class it extends Pe{constructor(){super(),this.isLineGeometry=!0,this.type="LineGeometry"}setPositions(e){const t=e.length-3,r=new Float32Array(2*t);for(let s=0;s<t;s+=3)r[2*s]=e[s],r[2*s+1]=e[s+1],r[2*s+2]=e[s+2],r[2*s+3]=e[s+3],r[2*s+4]=e[s+4],r[2*s+5]=e[s+5];return super.setPositions(r),this}setColors(e,t=3){const r=e.length-t,s=new Float32Array(2*r);if(t===3)for(let o=0;o<r;o+=t)s[2*o]=e[o],s[2*o+1]=e[o+1],s[2*o+2]=e[o+2],s[2*o+3]=e[o+3],s[2*o+4]=e[o+4],s[2*o+5]=e[o+5];else for(let o=0;o<r;o+=t)s[2*o]=e[o],s[2*o+1]=e[o+1],s[2*o+2]=e[o+2],s[2*o+3]=e[o+3],s[2*o+4]=e[o+4],s[2*o+5]=e[o+5],s[2*o+6]=e[o+6],s[2*o+7]=e[o+7];return super.setColors(s,t),this}fromLine(e){const t=e.geometry;return this.setPositions(t.attributes.position.array),this}}class ze extends ft{constructor(e){super({type:"LineMaterial",uniforms:Te.clone(Te.merge([We.common,We.fog,{worldUnits:{value:1},linewidth:{value:1},resolution:{value:new et(1,1)},dashOffset:{value:0},dashScale:{value:1},dashSize:{value:1},gapSize:{value:1}}])),vertexShader:`
				#include <common>
				#include <fog_pars_vertex>
				#include <logdepthbuf_pars_vertex>
				#include <clipping_planes_pars_vertex>

				uniform float linewidth;
				uniform vec2 resolution;

				attribute vec3 instanceStart;
				attribute vec3 instanceEnd;

				#ifdef USE_COLOR
					#ifdef USE_LINE_COLOR_ALPHA
						varying vec4 vLineColor;
						attribute vec4 instanceColorStart;
						attribute vec4 instanceColorEnd;
					#else
						varying vec3 vLineColor;
						attribute vec3 instanceColorStart;
						attribute vec3 instanceColorEnd;
					#endif
				#endif

				#ifdef WORLD_UNITS

					varying vec4 worldPos;
					varying vec3 worldStart;
					varying vec3 worldEnd;

					#ifdef USE_DASH

						varying vec2 vUv;

					#endif

				#else

					varying vec2 vUv;

				#endif

				#ifdef USE_DASH

					uniform float dashScale;
					attribute float instanceDistanceStart;
					attribute float instanceDistanceEnd;
					varying float vLineDistance;

				#endif

				void trimSegment( const in vec4 start, inout vec4 end ) {

					// trim end segment so it terminates between the camera plane and the near plane

					// conservative estimate of the near plane
					float a = projectionMatrix[ 2 ][ 2 ]; // 3nd entry in 3th column
					float b = projectionMatrix[ 3 ][ 2 ]; // 3nd entry in 4th column
					float nearEstimate = - 0.5 * b / a;

					float alpha = ( nearEstimate - start.z ) / ( end.z - start.z );

					end.xyz = mix( start.xyz, end.xyz, alpha );

				}

				void main() {

					#ifdef USE_COLOR

						vLineColor = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;

					#endif

					#ifdef USE_DASH

						vLineDistance = ( position.y < 0.5 ) ? dashScale * instanceDistanceStart : dashScale * instanceDistanceEnd;
						vUv = uv;

					#endif

					float aspect = resolution.x / resolution.y;

					// camera space
					vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
					vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );

					#ifdef WORLD_UNITS

						worldStart = start.xyz;
						worldEnd = end.xyz;

					#else

						vUv = uv;

					#endif

					// special case for perspective projection, and segments that terminate either in, or behind, the camera plane
					// clearly the gpu firmware has a way of addressing this issue when projecting into ndc space
					// but we need to perform ndc-space calculations in the shader, so we must address this issue directly
					// perhaps there is a more elegant solution -- WestLangley

					bool perspective = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 ); // 4th entry in the 3rd column

					if ( perspective ) {

						if ( start.z < 0.0 && end.z >= 0.0 ) {

							trimSegment( start, end );

						} else if ( end.z < 0.0 && start.z >= 0.0 ) {

							trimSegment( end, start );

						}

					}

					// clip space
					vec4 clipStart = projectionMatrix * start;
					vec4 clipEnd = projectionMatrix * end;

					// ndc space
					vec3 ndcStart = clipStart.xyz / clipStart.w;
					vec3 ndcEnd = clipEnd.xyz / clipEnd.w;

					// direction
					vec2 dir = ndcEnd.xy - ndcStart.xy;

					// account for clip-space aspect ratio
					dir.x *= aspect;
					dir = normalize( dir );

					#ifdef WORLD_UNITS

						// get the offset direction as perpendicular to the view vector
						vec3 worldDir = normalize( end.xyz - start.xyz );
						vec3 offset;
						if ( position.y < 0.5 ) {

							offset = normalize( cross( start.xyz, worldDir ) );

						} else {

							offset = normalize( cross( end.xyz, worldDir ) );

						}

						// sign flip
						if ( position.x < 0.0 ) offset *= - 1.0;

						float forwardOffset = dot( worldDir, vec3( 0.0, 0.0, 1.0 ) );

						// don't extend the line if we're rendering dashes because we
						// won't be rendering the endcaps
						#ifndef USE_DASH

							// extend the line bounds to encompass  endcaps
							start.xyz += - worldDir * linewidth * 0.5;
							end.xyz += worldDir * linewidth * 0.5;

							// shift the position of the quad so it hugs the forward edge of the line
							offset.xy -= dir * forwardOffset;
							offset.z += 0.5;

						#endif

						// endcaps
						if ( position.y > 1.0 || position.y < 0.0 ) {

							offset.xy += dir * 2.0 * forwardOffset;

						}

						// adjust for linewidth
						offset *= linewidth * 0.5;

						// set the world position
						worldPos = ( position.y < 0.5 ) ? start : end;
						worldPos.xyz += offset;

						// project the worldpos
						vec4 clip = projectionMatrix * worldPos;

						// shift the depth of the projected points so the line
						// segments overlap neatly
						vec3 clipPose = ( position.y < 0.5 ) ? ndcStart : ndcEnd;
						clip.z = clipPose.z * clip.w;

					#else

						vec2 offset = vec2( dir.y, - dir.x );
						// undo aspect ratio adjustment
						dir.x /= aspect;
						offset.x /= aspect;

						// sign flip
						if ( position.x < 0.0 ) offset *= - 1.0;

						// endcaps
						if ( position.y < 0.0 ) {

							offset += - dir;

						} else if ( position.y > 1.0 ) {

							offset += dir;

						}

						// adjust for linewidth
						offset *= linewidth;

						// adjust for clip-space to screen-space conversion // maybe resolution should be based on viewport ...
						offset /= resolution.y;

						// select end
						vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;

						// back to clip space
						offset *= clip.w;

						clip.xy += offset;

					#endif

					gl_Position = clip;

					vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // this is an approximation

					#include <logdepthbuf_vertex>
					#include <clipping_planes_vertex>
					#include <fog_vertex>

				}
			`,fragmentShader:`
				uniform vec3 diffuse;
				uniform float opacity;
				uniform float linewidth;

				#ifdef USE_DASH

					uniform float dashOffset;
					uniform float dashSize;
					uniform float gapSize;

				#endif

				varying float vLineDistance;

				#ifdef WORLD_UNITS

					varying vec4 worldPos;
					varying vec3 worldStart;
					varying vec3 worldEnd;

					#ifdef USE_DASH

						varying vec2 vUv;

					#endif

				#else

					varying vec2 vUv;

				#endif

				#include <common>
				#include <fog_pars_fragment>
				#include <logdepthbuf_pars_fragment>
				#include <clipping_planes_pars_fragment>

				#ifdef USE_COLOR
					#ifdef USE_LINE_COLOR_ALPHA
						varying vec4 vLineColor;
					#else
						varying vec3 vLineColor;
					#endif
				#endif

				vec2 closestLineToLine(vec3 p1, vec3 p2, vec3 p3, vec3 p4) {

					float mua;
					float mub;

					vec3 p13 = p1 - p3;
					vec3 p43 = p4 - p3;

					vec3 p21 = p2 - p1;

					float d1343 = dot( p13, p43 );
					float d4321 = dot( p43, p21 );
					float d1321 = dot( p13, p21 );
					float d4343 = dot( p43, p43 );
					float d2121 = dot( p21, p21 );

					float denom = d2121 * d4343 - d4321 * d4321;

					float numer = d1343 * d4321 - d1321 * d4343;

					mua = numer / denom;
					mua = clamp( mua, 0.0, 1.0 );
					mub = ( d1343 + d4321 * ( mua ) ) / d4343;
					mub = clamp( mub, 0.0, 1.0 );

					return vec2( mua, mub );

				}

				void main() {

					#include <clipping_planes_fragment>

					#ifdef USE_DASH

						if ( vUv.y < - 1.0 || vUv.y > 1.0 ) discard; // discard endcaps

						if ( mod( vLineDistance + dashOffset, dashSize + gapSize ) > dashSize ) discard; // todo - FIX

					#endif

					float alpha = opacity;

					#ifdef WORLD_UNITS

						// Find the closest points on the view ray and the line segment
						vec3 rayEnd = normalize( worldPos.xyz ) * 1e5;
						vec3 lineDir = worldEnd - worldStart;
						vec2 params = closestLineToLine( worldStart, worldEnd, vec3( 0.0, 0.0, 0.0 ), rayEnd );

						vec3 p1 = worldStart + lineDir * params.x;
						vec3 p2 = rayEnd * params.y;
						vec3 delta = p1 - p2;
						float len = length( delta );
						float norm = len / linewidth;

						#ifndef USE_DASH

							#ifdef USE_ALPHA_TO_COVERAGE

								float dnorm = fwidth( norm );
								alpha = 1.0 - smoothstep( 0.5 - dnorm, 0.5 + dnorm, norm );

							#else

								if ( norm > 0.5 ) {

									discard;

								}

							#endif

						#endif

					#else

						#ifdef USE_ALPHA_TO_COVERAGE

							// artifacts appear on some hardware if a derivative is taken within a conditional
							float a = vUv.x;
							float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
							float len2 = a * a + b * b;
							float dlen = fwidth( len2 );

							if ( abs( vUv.y ) > 1.0 ) {

								alpha = 1.0 - smoothstep( 1.0 - dlen, 1.0 + dlen, len2 );

							}

						#else

							if ( abs( vUv.y ) > 1.0 ) {

								float a = vUv.x;
								float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
								float len2 = a * a + b * b;

								if ( len2 > 1.0 ) discard;

							}

						#endif

					#endif

					vec4 diffuseColor = vec4( diffuse, alpha );
					#ifdef USE_COLOR
						#ifdef USE_LINE_COLOR_ALPHA
							diffuseColor *= vLineColor;
						#else
							diffuseColor.rgb *= vLineColor;
						#endif
					#endif

					#include <logdepthbuf_fragment>

					gl_FragColor = diffuseColor;

					#include <tonemapping_fragment>
					#include <${st>=154?"colorspace_fragment":"encodings_fragment"}>
					#include <fog_fragment>
					#include <premultiplied_alpha_fragment>

				}
			`,clipping:!0}),this.isLineMaterial=!0,this.onBeforeCompile=function(){this.transparent?this.defines.USE_LINE_COLOR_ALPHA="1":delete this.defines.USE_LINE_COLOR_ALPHA},Object.defineProperties(this,{color:{enumerable:!0,get:function(){return this.uniforms.diffuse.value},set:function(t){this.uniforms.diffuse.value=t}},worldUnits:{enumerable:!0,get:function(){return"WORLD_UNITS"in this.defines},set:function(t){t===!0?this.defines.WORLD_UNITS="":delete this.defines.WORLD_UNITS}},linewidth:{enumerable:!0,get:function(){return this.uniforms.linewidth.value},set:function(t){this.uniforms.linewidth.value=t}},dashed:{enumerable:!0,get:function(){return"USE_DASH"in this.defines},set(t){!!t!="USE_DASH"in this.defines&&(this.needsUpdate=!0),t===!0?this.defines.USE_DASH="":delete this.defines.USE_DASH}},dashScale:{enumerable:!0,get:function(){return this.uniforms.dashScale.value},set:function(t){this.uniforms.dashScale.value=t}},dashSize:{enumerable:!0,get:function(){return this.uniforms.dashSize.value},set:function(t){this.uniforms.dashSize.value=t}},dashOffset:{enumerable:!0,get:function(){return this.uniforms.dashOffset.value},set:function(t){this.uniforms.dashOffset.value=t}},gapSize:{enumerable:!0,get:function(){return this.uniforms.gapSize.value},set:function(t){this.uniforms.gapSize.value=t}},opacity:{enumerable:!0,get:function(){return this.uniforms.opacity.value},set:function(t){this.uniforms.opacity.value=t}},resolution:{enumerable:!0,get:function(){return this.uniforms.resolution.value},set:function(t){this.uniforms.resolution.value.copy(t)}},alphaToCoverage:{enumerable:!0,get:function(){return"USE_ALPHA_TO_COVERAGE"in this.defines},set:function(t){!!t!="USE_ALPHA_TO_COVERAGE"in this.defines&&(this.needsUpdate=!0),t===!0?(this.defines.USE_ALPHA_TO_COVERAGE="",this.extensions.derivatives=!0):(delete this.defines.USE_ALPHA_TO_COVERAGE,this.extensions.derivatives=!1)}}}),this.setValues(e)}}const Ee=new ue,Ge=new Y,Ve=new Y,U=new ue,D=new ue,X=new ue,$e=new Y,Ae=new tt,T=new ht,Ye=new Y,ye=new Fe,we=new Ze,q=new ue;let Q,re;function Xe(u,e,t){return q.set(0,0,-e,1).applyMatrix4(u.projectionMatrix),q.multiplyScalar(1/q.w),q.x=re/t.width,q.y=re/t.height,q.applyMatrix4(u.projectionMatrixInverse),q.multiplyScalar(1/q.w),Math.abs(Math.max(q.x,q.y))}function $t(u,e){const t=u.matrixWorld,r=u.geometry,s=r.attributes.instanceStart,o=r.attributes.instanceEnd,l=Math.min(r.instanceCount,s.count);for(let h=0,m=l;h<m;h++){T.start.fromBufferAttribute(s,h),T.end.fromBufferAttribute(o,h),T.applyMatrix4(t);const a=new Y,i=new Y;Q.distanceSqToSegment(T.start,T.end,i,a),i.distanceTo(a)<re*.5&&e.push({point:i,pointOnLine:a,distance:Q.origin.distanceTo(i),object:u,face:null,faceIndex:h,uv:null,[ot]:null})}}function At(u,e,t){const r=e.projectionMatrix,o=u.material.resolution,l=u.matrixWorld,h=u.geometry,m=h.attributes.instanceStart,a=h.attributes.instanceEnd,i=Math.min(h.instanceCount,m.count),c=-e.near;Q.at(1,X),X.w=1,X.applyMatrix4(e.matrixWorldInverse),X.applyMatrix4(r),X.multiplyScalar(1/X.w),X.x*=o.x/2,X.y*=o.y/2,X.z=0,$e.copy(X),Ae.multiplyMatrices(e.matrixWorldInverse,l);for(let b=0,p=i;b<p;b++){if(U.fromBufferAttribute(m,b),D.fromBufferAttribute(a,b),U.w=1,D.w=1,U.applyMatrix4(Ae),D.applyMatrix4(Ae),U.z>c&&D.z>c)continue;if(U.z>c){const E=U.z-D.z,R=(U.z-c)/E;U.lerp(D,R)}else if(D.z>c){const E=D.z-U.z,R=(D.z-c)/E;D.lerp(U,R)}U.applyMatrix4(r),D.applyMatrix4(r),U.multiplyScalar(1/U.w),D.multiplyScalar(1/D.w),U.x*=o.x/2,U.y*=o.y/2,D.x*=o.x/2,D.y*=o.y/2,T.start.copy(U),T.start.z=0,T.end.copy(D),T.end.z=0;const k=T.closestPointToPointParameter($e,!0);T.at(k,Ye);const F=mt.lerp(U.z,D.z,k),S=F>=-1&&F<=1,H=$e.distanceTo(Ye)<re*.5;if(S&&H){T.start.fromBufferAttribute(m,b),T.end.fromBufferAttribute(a,b),T.start.applyMatrix4(l),T.end.applyMatrix4(l);const E=new Y,R=new Y;Q.distanceSqToSegment(T.start,T.end,R,E),t.push({point:R,pointOnLine:E,distance:Q.origin.distanceTo(R),object:u,face:null,faceIndex:b,uv:null,[ot]:null})}}}class rt extends pt{constructor(e=new Pe,t=new ze({color:Math.random()*16777215})){super(e,t),this.isLineSegments2=!0,this.type="LineSegments2"}computeLineDistances(){const e=this.geometry,t=e.attributes.instanceStart,r=e.attributes.instanceEnd,s=new Float32Array(2*t.count);for(let l=0,h=0,m=t.count;l<m;l++,h+=2)Ge.fromBufferAttribute(t,l),Ve.fromBufferAttribute(r,l),s[h]=h===0?0:s[h-1],s[h+1]=s[h]+Ge.distanceTo(Ve);const o=new Le(s,2,1);return e.setAttribute("instanceDistanceStart",new ae(o,1,0)),e.setAttribute("instanceDistanceEnd",new ae(o,1,1)),this}raycast(e,t){const r=this.material.worldUnits,s=e.camera;s===null&&!r&&console.error('LineSegments2: "Raycaster.camera" needs to be set in order to raycast against LineSegments2 while worldUnits is set to false.');const o=e.params.Line2!==void 0&&e.params.Line2.threshold||0;Q=e.ray;const l=this.matrixWorld,h=this.geometry,m=this.material;re=m.linewidth+o,h.boundingSphere===null&&h.computeBoundingSphere(),we.copy(h.boundingSphere).applyMatrix4(l);let a;if(r)a=re*.5;else{const c=Math.max(s.near,we.distanceToPoint(Q.origin));a=Xe(s,c,m.resolution)}if(we.radius+=a,Q.intersectsSphere(we)===!1)return;h.boundingBox===null&&h.computeBoundingBox(),ye.copy(h.boundingBox).applyMatrix4(l);let i;if(r)i=re*.5;else{const c=Math.max(s.near,ye.distanceToPoint(Q.origin));i=Xe(s,c,m.resolution)}ye.expandByScalar(i),Q.intersectsBox(ye)!==!1&&(r?$t(this,t):At(this,s,t))}onBeforeRender(e){const t=this.material.uniforms;t&&t.resolution&&(e.getViewport(Ee),this.material.uniforms.resolution.value.set(Ee.z,Ee.w))}}class Bt extends rt{constructor(e=new it,t=new ze({color:Math.random()*16777215})){super(e,t),this.isLine2=!0,this.type="Line2"}}const J=_.forwardRef(function({points:e,color:t=16777215,vertexColors:r,linewidth:s,lineWidth:o,segments:l,dashed:h,...m},a){var i,c;const b=Re(S=>S.size),p=_.useMemo(()=>l?new rt:new Bt,[l]),[g]=_.useState(()=>new ze),k=(r==null||(i=r[0])==null?void 0:i.length)===4?4:3,F=_.useMemo(()=>{const S=l?new Pe:new it,H=e.map(E=>{const R=Array.isArray(E);return E instanceof Y||E instanceof ue?[E.x,E.y,E.z]:E instanceof et?[E.x,E.y,0]:R&&E.length===3?[E[0],E[1],E[2]]:R&&E.length===2?[E[0],E[1],0]:E});if(S.setPositions(H.flat()),r){t=16777215;const E=r.map(R=>R instanceof xt?R.toArray():R);S.setColors(E.flat(),k)}return S},[e,l,r,k]);return _.useLayoutEffect(()=>{p.computeLineDistances()},[e,p]),_.useLayoutEffect(()=>{h?g.defines.USE_DASH="":delete g.defines.USE_DASH,g.needsUpdate=!0},[h,g]),_.useEffect(()=>()=>{F.dispose(),g.dispose()},[F]),_.createElement("primitive",He({object:p,ref:a},m),_.createElement("primitive",{object:F,attach:"geometry"}),_.createElement("primitive",He({object:g,attach:"material",color:t,vertexColors:!!r,resolution:[b.width,b.height],linewidth:(c=s??o)!==null&&c!==void 0?c:1,dashed:h,transparent:k===4},m)))}),ve=Object.freeze({point:.02,wall:.05,angle:.01,size:.01}),Oe=8,at=["top","mid","bot"],W=(u,e)=>Math.hypot(u.x-e.x,u.y-e.y),Lt=/^(base|slab|fountain|ramp|highland|towerpad|plaza)_/,Ct=u=>u.replace("blue","red").replace(/(^|_)(top|bot)(_|$)/,(e,t,r,s)=>`${t}${r==="top"?"bot":"top"}${s}`),ie=(u,e,t)=>({x:2*e-u.x,y:2*t-u.y});function Ot(u,e){let t=Math.abs(u-e)%Math.PI;return Math.min(t,Math.PI-t)}function se(u,e,t,r){if(!u||!e||u.length!==e.length)return 1/0;let s=0;for(let o=0;o<u.length;o++)s=Math.max(s,W(ie(u[o],t,r),e[o]));return s}function Ft(u,e,t,r){const s={count:{blue:u.length,red:e.length},maxPosErr:0,maxSizeErr:0,maxAngErr:0,worst:null,ok:!1};if(u.length!==e.length)return s.maxPosErr=1/0,s;const o=new Uint8Array(e.length);for(const l of u){const h=ie(l,t,r);let m=-1,a=1/0;for(let p=0;p<e.length;p++){if(o[p])continue;const g=W(h,e[p]);g<a&&(a=g,m=p)}if(m<0)return s.maxPosErr=1/0,s;o[m]=1;const i=e[m],c=Math.max(Math.abs(l.len-i.len),Math.abs(l.thick-i.thick),Math.abs(l.h-i.h)),b=Ot(l.angle,i.angle);a>s.maxPosErr&&(s.maxPosErr=a,s.worst={blue:{x:l.x,y:l.y},red:{x:i.x,y:i.y},err:a}),s.maxSizeErr=Math.max(s.maxSizeErr,c),s.maxAngErr=Math.max(s.maxAngErr,b)}return s.ok=s.maxPosErr<=ve.wall&&s.maxSizeErr<=ve.size&&s.maxAngErr<=ve.angle,s}function Rt(u,e){const t=e.meta.bounds.centerX,r=e.meta.bounds.centerY,s=e.meta.bases,o=[],l=(a,i,c,b="",p=ve.point)=>o.push({id:a,label:i,ok:c<=p,err:Number.isFinite(c)?+c.toFixed(4):1/0,detail:b});l("nexus","主堡座標",W(ie(u.bases.blue,t,r),u.bases.red)),l("fountain","泉水座標",W(ie(u.fountains.blue,t,r),u.fountains.red)),l("apron_center","主堡平台中心",W(ie(s.blue.center,t,r),s.red.center));{const a=e.nexusTurrets.filter(b=>b.side==="blue"),i=e.nexusTurrets.filter(b=>b.side==="red");let c=a.length===2&&i.length===2?0:1/0;if(Number.isFinite(c))for(const b of a){const p=ie(b,t,r);c=Math.max(c,Math.min(...i.map(g=>W(p,g))))}l("nexus_turret","門牙塔（每方 2 座）",c,`藍 ${a.length} / 紅 ${i.length}`)}{let a=0,i=0,c={blue:0,red:0};for(const b of at)for(let p=0;p<3;p++){const g=e.towers.find(S=>S.side==="blue"&&S.lane===b&&S.tier===p),k=e.towers.find(S=>S.side==="red"&&S.lane===de[b]&&S.tier===p);if(!g||!k){i=1/0;continue}const F=W(ie(g,t,r),k);i=Math.max(i,F),g.kind==="highground"&&(a=Math.max(a,F))}for(const b of e.towers)b.kind==="highground"&&c[b.side]++;l("highground_tower","高地塔（每方 3 座）",a,`藍 ${c.blue} / 紅 ${c.red}`),l("lane_tower","兵線塔 18 座",i)}l("apron_poly","高地平台外型",se(s.blue.apronPoly,s.red.apronPoly,t,r)),l("court_poly","內庭鋪面外型",se(s.blue.courtPoly,s.red.courtPoly,t,r)),l("keep_poly","主堡台外型",se(s.blue.keepPoly,s.red.keepPoly,t,r)),l("highland_poly","高地草地外型",se(s.blue.highlandPoly,s.red.highlandPoly,t,r));{let a=0,i=0;for(let c=0;c<3;c++)a=Math.max(a,se(s.blue.exitCorridors[c].poly,s.red.exitCorridors[2-c].poly,t,r)),i=Math.max(i,se(s.blue.ramps[c].poly,s.red.ramps[2-c].poly,t,r));l("exit_corridor","三路出口淨空通道",a),l("exit_ramp","三路出口坡道",i)}const h=a=>W(a,u.bases.blue)<W(a,u.bases.red)?"blue":"red";for(const[a,i]of[["base_rim","高地外牆段"],["base_keep","主堡內牆段"],["base_gate","城門墩／稜堡段"],["fountain_rim","泉水池緣段"]]){const c=e.wallItems.filter(k=>k.kind===a),b=c.filter(k=>h(k)==="blue"),p=c.filter(k=>h(k)==="red"),g=Ft(b,p,t,r);o.push({id:`wall_${a}`,label:i,ok:g.ok,err:Number.isFinite(g.maxPosErr)?+g.maxPosErr.toFixed(4):1/0,detail:`藍 ${g.count.blue} 段 / 紅 ${g.count.red} 段｜尺寸差 ${g.maxSizeErr.toFixed(3)}｜角度差 ${g.maxAngErr.toFixed(4)}`})}{const a=p=>e.groundLayers.filter(g=>Lt.test(g.id)&&g.id.includes(p)),i=a("blue"),c=a("red");let b=i.length===c.length?0:1/0;if(Number.isFinite(b)){const p=new Map(c.map(g=>[g.id,g]));for(const g of i){const k=p.get(Ct(g.id));if(!k){b=1/0;break}b=Math.max(b,se(g.poly,k.poly,t,r))}}l("ground_layers","基地地面層（平台/石板/泉水/坡道/高地）",b,`藍 ${i.length} 層 / 紅 ${c.length} 層`)}{const a=(c,b)=>{var p;return(p=e.groundLayers.find(g=>g.id===`base_${c}_${b}`))==null?void 0:p.color},i=["apron","court","keep"].every(c=>a("blue",c)===a("red",c));o.push({id:"platform_color",label:"基地平台色（兩方應同色、中性石材）",ok:i,err:i?0:1/0,detail:i?`#${(a("blue","apron")??0).toString(16).padStart(6,"0")}`:"藍紅平台色不同"})}const m=Math.max(...o.map(a=>Number.isFinite(a.err)?a.err:1/0));return{ok:o.every(a=>a.ok),maxErr:m,checks:o}}function It(u,e){const t=e.meta.bounds.centerX,r=e.meta.bounds.centerY,s={};for(const o of["blue","red"]){const l=u.bases[o],h=u.fountains[o],m=e.nexusTurrets.filter(S=>S.side===o),a=S=>e.towers.filter(H=>H.side===o&&H.kind===S).map(H=>H.distToOwnBase),i=a("highground"),c=a("inner"),b=a("outer"),p=m.map(S=>S.distToOwnBase),g=S=>Math.hypot(S.x-t,S.y-r),k=[{id:"fountain",label:"泉水區",value:W(h,l),note:"距主堡"},{id:"nexus",label:"主堡 / Nexus",value:0,note:"層級原點"},{id:"nexus_turret",label:"門牙塔 ×2",value:Math.min(...p),note:`距主堡 ${Math.min(...p).toFixed(1)}`},{id:"keep_wall",label:"主堡內牆",value:le.keepWallR,note:"主堡台邊界"},{id:"apron",label:"主堡平台",value:le.apronR,note:"高地平台半徑"},{id:"highground",label:"高地塔 ×3",value:Math.min(...i),note:`${Math.min(...i).toFixed(1)}~${Math.max(...i).toFixed(1)}`},{id:"inner",label:"內塔 ×3",value:Math.min(...c),note:`${Math.min(...c).toFixed(1)}~${Math.max(...c).toFixed(1)}`},{id:"outer",label:"外塔 ×3",value:Math.min(...b),note:`${Math.min(...b).toFixed(1)}~${Math.max(...b).toFixed(1)}`}],F=[{id:"fountain_behind",label:"泉水在主堡後方（離地圖中心更遠）",ok:g(h)>g(l)},{id:"turret_count",label:"門牙塔 = 2 座",ok:m.length===2},{id:"highground_count",label:"高地塔 = 3 座",ok:i.length===3},{id:"turret_on_keep",label:"門牙塔站在主堡台上（距主堡 < keepR）",ok:Math.max(...p)<le.keepR},{id:"turret_lr",label:"兩座門牙塔左右分立（間距 > 12）",ok:m.length===2&&W(m[0],m[1])>12},{id:"hg_band",label:`高地塔在 ${be.min}~${be.max} 環帶（不貼主堡、不跑到路中段）`,ok:Math.min(...i)>=be.min&&Math.max(...i)<=be.max},{id:"hg_gap",label:"高地塔與門牙塔有層級距離（> 18）",ok:Math.min(...i)-Math.max(...p)>18},{id:"hg_outside_wall",label:"高地塔在高地外牆之外（> apronR）",ok:Math.min(...i)>le.apronR},{id:"order",label:"由主堡往外遞增：門牙 < 高地 < 內塔 < 外塔",ok:Math.max(...p)<Math.min(...i)&&Math.max(...i)<Math.min(...c)&&Math.max(...c)<Math.min(...b)}];s[o]={rows:k,checks:F,ok:F.every(S=>S.ok),order:bt}}return{ok:s.blue.ok&&s.red.ok,sides:s}}function Pt(u,e,t){const r=u.baseBlueprint[e].find(s=>s.kind==="exit_corridor"&&s.lane===t);return(r==null?void 0:r.line)??[]}function zt(u,e,t){const r=(o,l)=>{const h=t.gx(o),m=t.gy(l);return h<0||m<0||h>=t.nx||m>=t.ny?0:t.dist[t.idx(h,m)]*t.cellToSim},s=[];for(const o of["blue","red"])at.forEach(l=>{const h=Pt(e,o,l);let m=1/0,a=null;for(let i=0;i+1<h.length;i++){const c=h[i],b=h[i+1],p=Math.max(2,Math.ceil(W(c,b)/1));for(let g=0;g<=p;g++){const k={x:c.x+(b.x-c.x)*(g/p),y:c.y+(b.y-c.y)*(g/p)},F=r(k.x,k.y);F<m&&(m=F,a={x:k.x,y:k.y,clear:F})}}s.push({id:`${o}_${l}`,side:o,lane:l,minClear:+m.toFixed(2),width:+(m*2).toFixed(2),heroOk:m>=Ie,ok:m*2>=Oe,pinch:a})});return{ok:s.every(o=>o.ok),exits:s,minWidth:Math.min(...s.map(o=>o.width))}}const qe=u=>u.replace(/blue|red/,e=>e==="blue"?"red":"blue").replace(/(^|_)(top|bot)(?=_|$)/g,(e,t,r)=>`${t}${r==="top"?"bot":"top"}`),Ut=(u,e)=>Math.abs(Math.atan2(Math.sin(u-e),Math.cos(u-e)));function Dt(u){const e=u.meta.bounds.centerX,t=u.meta.bounds.centerY,r=u.baseBlueprint,s=[],o=(f,x,M,y="")=>s.push({id:f,label:x,ok:M,detail:y});o("count","藍紅 blueprint 件數相同",r.blue.length===r.red.length,`藍 ${r.blue.length} 件 / 紅 ${r.red.length} 件`);const l=r.blue.map(f=>f.id);o("stable_id","每個結構件都有唯一 stable id",l.every(f=>typeof f=="string"&&f.length>0)&&new Set(l).size===l.length,`${new Set(l).size}/${l.length} 個唯一 id`);const h=new Map(r.red.map(f=>[f.id,f])),m=new Map(r.blue.map(f=>[f.id,f]));let a=0,i=0,c=0,b=0,p=0,g=0,k=0;for(const f of r.blue){const x=h.get(qe(f.id));if(!x){a++;continue}if((x.kind!==f.kind||x.role!==f.role)&&p++,i=Math.max(i,W({x:2*e-f.x,y:2*t-f.y},x)),c=Math.max(c,Ut(x.rot,f.rot+Math.PI)),b=Math.max(b,Math.abs((x.len??0)-(f.len??0)),Math.abs((x.thick??0)-(f.thick??0)),Math.abs((x.h??0)-(f.h??0))),f.poly)if(!x.poly||x.poly.length!==f.poly.length)g=1/0;else for(let M=0;M<f.poly.length;M++)g=Math.max(g,W({x:2*e-f.poly[M].x,y:2*t-f.poly[M].y},x.poly[M]))}for(const f of r.red)m.has(qe(f.id))||k++;o("mirror_pair","紅方每一件都對得上藍方的 id",a===0,`缺 ${a} 件`),o("no_orphan","紅方沒有「自己長出來」的孤兒件（unmatched item）",k===0,`孤兒 ${k} 件`),o("kind","配對件的 kind / role 相同",p===0,`不符 ${p} 件`),o("position","配對件的 position 精確鏡射",i<1e-9,`最大誤差 ${i.toExponential(2)}`),o("rotation","配對件的 rotation 精確鏡射（+π）",c<1e-9,`最大誤差 ${c.toExponential(2)}`),o("scale","配對件的 scale（長 / 厚 / 高）完全相同",b<1e-9,`最大誤差 ${b.toExponential(2)}`),o("poly","配對件的多邊形逐頂點鏡射",g<1e-9,Number.isFinite(g)?`最大誤差 ${g.toExponential(2)}`:"頂點數不符");{const f=[];for(const x of["base_rim","base_keep","base_gate","fountain_rim"]){const M=r.blue.filter(y=>y.kind===x);if(M.length)for(const y of["len","thick","h"]){const w=new Set(M.map($=>+$[y].toFixed(9)));w.size>1&&f.push(`${x}.${y}×${w.size}`)}}o("no_jitter","基地結構牆的 len / thick / height 沒有 jitter（各只有一種值）",f.length===0,f.length?f.join("／"):"全部收斂")}const F=/^wall_(?:blue|red)_exit_(top|mid|bot)_(.+)$/,S=f=>Math.atan2(Math.sin(f),Math.cos(f)),H=f=>{const x=r[f].find(w=>w.kind==="apron_center"),M=new Map(r[f].filter(w=>w.kind==="gate").map(w=>[w.lane,w.rot])),y=new Map;for(const w of r[f]){const $=F.exec(w.id||"");if(!$)continue;const[,L,I]=$,P=M.get(L);if(P===void 0)continue;const v=Math.cos(P),C=Math.sin(P),j=w.x-x.x,B=w.y-x.y;y.has(L)||y.set(L,new Map),y.get(L).set(I,{lx:j*v+B*C,ly:-j*C+B*v,lrot:S(w.rot+P),len:w.len,thick:w.thick,h:w.h,kind:w.kind})}return y},E={blue:H("blue"),red:H("red")};{const f=[];let x=0,M=0;for(const y of["blue","red"]){const w=E[y],$=[...w.keys()];if($.length!==3){f.push(`${y} 只有 ${$.length} 個出口牆組`);continue}const L=w.get($[0]);M=L.size;for(const I of $.slice(1)){const P=w.get(I);if(P.size!==L.size){f.push(`${y} ${I} 元件數 ${P.size} ≠ ${L.size}`);continue}for(const[v,C]of L){const j=P.get(v);if(!j){f.push(`${y} ${I} 缺元件 ${v}`);continue}if(j.kind!==C.kind){f.push(`${y} ${I} ${v} kind 不同`);continue}const B=Math.max(Math.abs(j.lx-C.lx),Math.abs(j.ly-C.ly),Math.abs(S(j.lrot-C.lrot)),Math.abs(j.len-C.len),Math.abs(j.thick-C.thick),Math.abs(j.h-C.h));x=Math.max(x,B),B>1e-9&&f.push(`${y} ${I} ${v} 偏差 ${B.toExponential(2)}`)}}}o("module_congruent","三個出口的牆體逐件由同一份模組旋轉而來（轉回局部座標後完全重合）",f.length===0,f.length?f.slice(0,4).join("／"):`每個出口 ${M} 件，最大偏差 ${x.toExponential(2)}`)}{const f=["flankLeft","pierLeft","pierRight","flankRight","shoulderLeft","shoulderRight"],x=[];for(const M of["blue","red"])for(const[y,w]of E[M]){const $=new Set([...w.keys()].map(L=>L.replace(/_\d+$/,"")));for(const L of f)$.has(L)||x.push(`${M} ${y} 缺 ${L}`)}o("module_parts","每個出口都有 flankLeft／pierLeft／gate／pierRight／flankRight／shoulderLeft／shoulderRight",x.length===0,x.length?x.slice(0,4).join("／"):"六個實體元件 + 中央出口開口")}{const f=[];let x=0;for(const M of["blue","red"])for(const[y,w]of E[M])for(const[$,L]of[["flankLeft","flankRight"],["pierLeft","pierRight"],["shoulderLeft","shoulderRight"]]){const I=[...w].filter(([v])=>v===$||v.startsWith(`${$}_`)),P=[...w].filter(([v])=>v===L||v.startsWith(`${L}_`));if(I.length!==P.length){f.push(`${M} ${y} ${$}/${L} 段數 ${I.length}/${P.length}`);continue}for(let v=0;v<I.length;v++){const C=I[v][1],j=P[v][1],B=Math.max(Math.abs(C.lx-j.lx),Math.abs(C.ly+j.ly),Math.abs(C.len-j.len),Math.abs(C.thick-j.thick),Math.abs(C.h-j.h));x=Math.max(x,B),B>1e-9&&f.push(`${M} ${y} ${$}[${v}] 與 ${L}[${v}] 不鏡射（${B.toExponential(2)}）`)}}o("module_lr_mirror","模組自身左右鏡射（左右翼牆／門柱／肩牆對出口中軸互為鏡射）",f.length===0,f.length?f.slice(0,4).join("／"):`最大偏差 ${x.toExponential(2)}`)}{const f=[];for(const M of["blue","red"])for(const[,y]of E[M]){const w=y.get("pierLeft"),$=y.get("pierRight");if(!w||!$){f.push(NaN);continue}f.push(Math.abs(w.ly-$.ly)-(w.thick+$.thick)/2)}const x=Math.max(...f.map(M=>Math.abs(M-le.gateClear)));o("gate_clear",`六個出口的門柱淨開口都 = gateClear（${le.gateClear}）`,Number.isFinite(x)&&x<1e-9,`${f.length} 個出口，${Math.min(...f).toFixed(3)}~${Math.max(...f).toFixed(3)}`)}{const f=/^wall_(?:blue|red)_(?:exit_(?:top|mid|bot)_|fountainrim_)/,x=[];for(const M of["blue","red"])for(const y of r[M])y.role==="wall"&&!f.test(y.id)&&x.push(y.id);o("wall_single_source","基地牆體只有一個來源：每一段都屬於三個出口模組之一（沒有後翼牆、沒有另一圈共用內牆、沒有補丁牆）",x.length===0,x.length?`模組以外的牆 ${x.length} 段：${x.slice(0,3).join(",")}`:"全部出自模組")}{const f=[];let x=0,M=0;for(const y of["blue","red"]){const w=r[y].find(v=>v.kind==="apron_center"),$=Math.cos(w.rot),L=Math.sin(w.rot),I=r[y].filter(v=>v.role==="wall"&&v.kind!=="fountain_rim");M=I.length;const P=I.map(v=>{const C=v.x-w.x,j=v.y-w.y;let B=(v.rot+w.rot)%Math.PI;return B<0&&(B+=Math.PI),{x:C*$+j*L,y:-C*L+j*$,a:B,len:v.len,thick:v.thick,h:v.h,id:v.id}});for(const v of P){let C=(Math.PI-v.a)%Math.PI;C<0&&(C+=Math.PI);let j=1/0;for(const B of P){if(Math.abs(B.len-v.len)>1e-9||Math.abs(B.thick-v.thick)>1e-9||Math.abs(B.h-v.h)>1e-9)continue;const je=Math.min(Math.abs(B.a-C),Math.PI-Math.abs(B.a-C));j=Math.min(j,Math.max(Math.hypot(B.x-v.x,B.y+v.y),je))}x=Math.max(x,j),j>1e-6&&f.push(`${v.id} 找不到鏡射對應段（最小誤差 ${j.toFixed(3)}）`)}}o("wall_fan_mirror","整道城牆對出口扇形中軸完全鏡射（top 與 bot 互為鏡像、mid 自身左右對稱；兩個牆端等長對稱）",f.length===0,f.length?f.slice(0,3).join("／"):`每方 ${M} 段，最大鏡射誤差 ${x.toExponential(2)}`)}const R=[];for(const f of["blue","red"]){const x=r[f],M=x.find(y=>y.kind==="keep");for(const y of x.filter(w=>w.kind==="gate")){const w=Math.cos(y.rot),$=Math.sin(y.rot);let L=1/0,I=1/0;for(const P of x.filter(v=>v.role==="wall"&&(v.kind==="base_rim"||v.kind==="base_gate"))){const v=P.x-M.x,C=P.y-M.y;if(v*w+C*$<0)continue;const j=-v*$+C*w,B=Math.abs(j)-P.thick/2;j>=0?L=Math.min(L,B):I=Math.min(I,B)}R.push({side:f,lane:y.lane,left:Number.isFinite(L)?+L.toFixed(3):null,right:Number.isFinite(I)?+I.toFixed(3):null})}}{let f=0;for(const x of R.filter(M=>M.side==="blue")){const M=R.find(y=>y.side==="red"&&y.lane===de[x.lane]);f=Math.max(f,Math.abs((x.left??-1)-(M.left??-1)),Math.abs((x.right??-1)-(M.right??-1)))}o("exit_lr_mirror","藍 lane ↔ 紅 lane 的出口左右淨距完全相同",f<1e-9,`最大差 ${f.toExponential(2)}`)}{const f=(x,M)=>r[x].filter(y=>y.kind===M).map(y=>{const w=r[x].find($=>$.kind==="keep");return+Math.hypot(y.x-w.x,y.y-w.y).toFixed(6)}).sort((y,w)=>y-w);for(const[x,M]of[["nexus_turret","門牙塔"],["highground_tower","高地塔"]]){const y=f("blue",x),w=f("red",x);o(`dist_${x}`,`${M}距主堡中心：兩方逐座相同`,y.length===w.length&&y.every(($,L)=>Math.abs($-w[L])<1e-9),`藍 ${y.map($=>$.toFixed(1)).join("/")}｜紅 ${w.map($=>$.toFixed(1)).join("/")}`)}}return{ok:s.every(f=>f.ok),rows:s,exits:R,count:r.blue.length}}const ee={font:"12px ui-monospace,monospace",color:"#e7edf5",cursor:"pointer",background:"#1a2430",border:"1px solid #2a3542",borderRadius:6,padding:"4px 9px"},Tt={full:{pos:[0,430,118],tgt:[0,0,0]},blue:{pos:[G(22)-90,240,V(202)+96],tgt:[0,0,0]},red:{pos:[G(198)+90,240,V(18)-96],tgt:[0,0,0]}},Qe={clean:{landmark:!1,labels:!1,coords:!1},debug:{landmark:!0,labels:!0,coords:!0}},Be=typeof window<"u"?new URLSearchParams(window.location.search).get("shot"):null,pe={dist:27,height:15,look:5,fov:42},Ke={height:100,fov:42},he={dist:56,height:18,look:7,fov:44},me={lane:!1,jungle:!1,towers:!1,pits:!1,bush:!1,monsters:!1,decor:!1,walls:!1,base:!1,baseFocus:null},xe={base:{...me,lane:!0,towers:!0,walls:!0,base:!0,baseFocus:"struct"},exits:{...me,lane:!0,base:!0,baseFocus:"exit"},walls:{...me,walls:!0,base:!0,baseFocus:"wall"},towers:{...me,lane:!0,towers:!0,base:!0,baseFocus:"exit"},overlay:{...me,towers:!0,walls:!0,base:!0,baseFocus:"bp_overlay"},full:{lane:!0,jungle:!0,towers:!0,pits:!0,bush:!0,monsters:!0,decor:!0,walls:!0,base:!0,baseFocus:null}};function Wt(u,e){const t=(l,h,m)=>e.baseBlueprint[l].find(a=>a.kind===h&&(m?a.lane===m:!0)),r=/^(blue|red)_(top|mid|bot)$/.exec(u??"");if(r){const l=t(r[1],"gate",r[2]),h=Math.cos(l.rot),m=Math.sin(l.rot),a=l.x+h*pe.dist,i=l.y+m*pe.dist;return{layers:xe.base,pos:[G(a),pe.height*oe,V(i)],tgt:[G(l.x),pe.look*oe,V(l.y)],fov:pe.fov}}const s=/^(blue|red)_(topdown|exits|walls|towers)$/.exec(u??"");if(s||u==="overlay"){const l=s?s[1]:"blue",h=s?s[2]:"overlay",m=t(l,"apron_center");return{layers:h==="topdown"?xe.base:xe[h],pos:[G(m.x),Ke.height*oe,V(m.y)],tgt:[G(m.x),0,V(m.y)],up:[Math.cos(m.rot),0,Math.sin(m.rot)],fov:Ke.fov}}const o=/^(blue|red)_low$/.exec(u??"");if(o){const l=t(o[1],"apron_center"),h=l.x+Math.cos(l.rot)*he.dist,m=l.y+Math.sin(l.rot)*he.dist;return{layers:xe.base,pos:[G(h),he.height*oe,V(m)],tgt:[G(l.x),he.look*oe,V(l.y)],fov:he.fov}}return{layers:xe.full,pos:[0,430,118],tgt:[0,0,0],fov:48}}function Ht({spec:u,id:e}){const{camera:t,invalidate:r}=Re(),s=_.useRef(0);return nt(()=>{t.position.set(u.pos[0],u.pos[1],u.pos[2]),t.up.set(...u.up??[0,1,0]),t.fov=u.fov,t.near=1,t.far=4e3,t.lookAt(u.tgt[0],u.tgt[1],u.tgt[2]),t.updateProjectionMatrix(),s.current+=1,s.current===40&&(window.__MAP_SHOT_READY=e)}),null}const Je={desktop:{label:"桌面",dpr:[1,2],ring:"desktop",shadow:!0,decor:!0},mobile:{label:"手機",dpr:[1,1.5],ring:"mobile",shadow:!1,decor:!0},low:{label:"手機低階",dpr:[1,1],ring:"mobile-low",shadow:!1,decor:!1}};function ce(u,e,t,r,s=28){const o=[];for(let l=0;l<=s;l++){const h=l/s*Math.PI*2;o.push([G(u)+Math.cos(h)*t*oe,r,V(e)+Math.sin(h)*t*oe])}return o}function Nt({field:u}){const e=_.useRef(),t=_.useMemo(()=>{const o=u,l=[],h=2.4;for(let m=o.B.minX+1;m<=o.B.maxX;m+=h)for(let a=o.B.minY+1;a<=o.B.maxY;a+=h){const i=o.gx(m),c=o.gy(a);i<0||c<0||i>=o.nx||c>=o.ny||o.dist[o.idx(i,c)]*o.cellToSim>=Ie&&l.push([m,a])}return l},[u]),r=_.useMemo(()=>{const o=new _t(1,6);return o.rotateX(-Math.PI/2),o},[]),s=_.useMemo(()=>new St({color:3854714,transparent:!0,opacity:.16,depthWrite:!1}),[]);return _.useEffect(()=>{const o=e.current;if(!o)return;const l=new tt,h=new kt,m=new Y(1.6,1,1.6),a=new Y;t.forEach(([i,c],b)=>{a.set(G(i),2,V(c)),l.compose(a,h,m),o.setMatrixAt(b,l)}),o.count=t.length,o.instanceMatrix.needsUpdate=!0,o.computeBoundingSphere()},[t]),n.jsx("instancedMesh",{ref:e,args:[r,s,Math.max(t.length,1)],frustumCulled:!1})}function Gt({L:u,T:e,PASS:t,opts:r}){const s=t.field.B,o=t.field.cellToSim,l=([a,i],c=3)=>[G(s.minX+a*o),c,V(s.minY+i*o)],h=_.useMemo(()=>{const a=[];return e.jungleStructures.forEach(i=>a.push({x:i.x,y:i.y,tag:"路"})),e.camps.forEach(i=>a.push({x:i.x,y:i.y,tag:"營"})),a.push({x:u.pits.dragon.x,y:u.pits.dragon.y,tag:"坑"}),a.push({x:u.pits.baron.x,y:u.pits.baron.y,tag:"坑"}),a},[u,e]),m=_.useMemo(()=>e.entrances.filter(a=>a.kind==="jungle"||a.kind==="pit"||a.kind==="base"),[e]);return n.jsxs("group",{children:[r.lines&&t.routes.map(a=>a.path?n.jsx(J,{points:a.path.filter((i,c)=>c%3===0).map(i=>l(i,3)),color:a.meetsSpec?"#5fd08a":"#e8664e",lineWidth:1.5,transparent:!0,opacity:.75},a.id):null),r.pinch&&t.routes.map(a=>a.pinch?n.jsx(J,{points:ce(a.pinch.x,a.pinch.y,a.narrowest/2,3.5),color:a.meetsSpec?"#8fd0ff":"#ffb14e",lineWidth:2},"p"+a.id):null),r.hero&&t.routes.map(a=>a.pinch?n.jsx(J,{points:ce(a.pinch.x,a.pinch.y,Ie,3.8),color:"#ffe08a",lineWidth:1.5},"h"+a.id):null),r.block&&t.routes.filter(a=>!a.meetsSpec).flatMap(a=>a.blockingChains.map((i,c)=>n.jsxs("mesh",{position:Me(i.x,i.y,5),children:[n.jsx("boxGeometry",{args:[3,10,3]}),n.jsx("meshBasicMaterial",{color:"#ff3b3b",transparent:!0,opacity:.5})]},a.id+"b"+c))),r.ents&&m.map((a,i)=>n.jsx(J,{points:ce(a.x,a.y,1.4,4.2),color:"#c7f39a",lineWidth:2},"e"+i)),r.nums&&h.map((a,i)=>n.jsxs(Ce,{position:Me(a.x,a.y,6),center:!0,distanceFactor:260,style:{font:"700 11px ui-monospace,monospace",color:"#ffd86b",textShadow:"0 1px 3px #000",pointerEvents:"none"},children:[a.tag,i+1]},"n"+i))]})}function Vt({L:u,T:e,exits:t}){const r=e.meta.bounds.centerX,s=e.meta.bounds.centerY,o=i=>({x:2*r-i.x,y:2*s-i.y}),l=(i,c)=>[...i,i[0]].map(b=>[G(b.x),c,V(b.y)]),h=e.meta.bases,m=_.useMemo(()=>{const i=[];for(const c of["apronPoly","courtPoly","keepPoly","highlandPoly"])i.push({blue:h.blue[c],red:h.red[c].map(o)});for(let c=0;c<3;c++)i.push({blue:h.blue.exitCorridors[c].poly,red:h.red.exitCorridors[2-c].poly.map(o)}),i.push({blue:h.blue.ramps[c].poly,red:h.red.ramps[2-c].poly.map(o)});return i},[e]),a=_.useMemo(()=>{const i=[{id:"主堡",p:u.bases.blue,r:4},{id:"泉水",p:u.fountains.blue,r:3},...e.nexusTurrets.filter(p=>p.side==="blue").map(p=>({id:`門牙${p.id.slice(-1)}`,p,r:2.4})),...e.towers.filter(p=>p.side==="blue"&&p.kind==="highground").map(p=>({id:`高地${p.lane}`,p,r:3.2})),...e.meta.bases.blue.gates.map((p,g)=>({id:`出口${p.lane}`,p,r:2.6}))],c=[{id:"主堡",p:u.bases.red},{id:"泉水",p:u.fountains.red},...e.nexusTurrets.filter(p=>p.side==="red").map(p=>({id:`門牙${p.id.slice(-1)}`,p})),...e.towers.filter(p=>p.side==="red"&&p.kind==="highground").map(p=>({id:`高地${de[p.lane]}`,p})),...e.meta.bases.red.gates.map(p=>({id:`出口${de[p.lane]}`,p}))];return i.map(p=>{const g=c.find(F=>F.id===p.id),k=g?o(g.p):null;return{...p,mirrored:k,err:k?Math.hypot(k.x-p.p.x,k.y-p.p.y):1/0}})},[u,e]);return n.jsxs("group",{children:[m.map((i,c)=>n.jsxs("group",{children:[n.jsx(J,{points:l(i.blue,9),color:"#37e0ff",lineWidth:1.6,transparent:!0,opacity:.9}),n.jsx(J,{points:l(i.red,9.6),color:"#ff5ad6",lineWidth:1.6,dashed:!0,dashSize:3,gapSize:3,transparent:!0,opacity:.9})]},"pp"+c)),a.map(i=>n.jsx(J,{points:ce(i.p.x,i.p.y,i.r,11),color:"#37e0ff",lineWidth:2.4},"bpb"+i.id)),a.filter(i=>i.mirrored).map(i=>n.jsx(J,{points:ce(i.mirrored.x,i.mirrored.y,i.r*1.25,11.4),color:i.err>.05?"#ff3b3b":"#ff5ad6",lineWidth:i.err>.05?3:2},"bpr"+i.id)),a.filter(i=>i.err>.05).map(i=>n.jsxs(Ce,{position:Me(i.p.x,i.p.y,18),center:!0,distanceFactor:280,style:{font:"700 12px ui-monospace,monospace",color:"#ff8a8a",background:"rgba(20,6,6,.85)",border:"1px solid #7a2a2a",borderRadius:4,padding:"1px 5px",whiteSpace:"nowrap",pointerEvents:"none"},children:[i.id," 差 ",i.err.toFixed(2)]},"bpe"+i.id)),t.map(i=>n.jsx(J,{points:ce(i.pinch.x,i.pinch.y,i.minClear,12),color:i.ok?"#5fd08a":"#e8664e",lineWidth:2},"ex"+i.id)),t.map(i=>n.jsx(Ce,{position:Me(i.pinch.x,i.pinch.y,14),center:!0,distanceFactor:300,style:{font:"700 11px ui-monospace,monospace",color:i.ok?"#a9f0c6":"#ffb0a0",textShadow:"0 1px 3px #000",pointerEvents:"none"},children:i.width},"exl"+i.id))]})}function Yt({onSample:u}){const{gl:e}=Re(),t=_.useRef(performance.now()),r=_.useRef(0),s=_.useRef(0);return nt(()=>{r.current++;const o=performance.now();if(s.current+=o-t.current,t.current=o,s.current>=500){const l=e.info;u({fps:r.current/(s.current/1e3),frameMs:s.current/r.current,calls:l.render.calls,tris:l.render.triangles,geometries:l.memory.geometries,textures:l.memory.textures,programs:l.programs?l.programs.length:0}),r.current=0,s.current=0}}),null}function Qt(){const u=_.useRef(null),e=_.useMemo(()=>gt(),[]),t=_.useMemo(()=>yt(e),[e]),r=_.useMemo(()=>wt(e,t),[e,t]),s=_.useMemo(()=>Be?Wt(Be,t):null,[t]),[o,l]=_.useState({lane:!0,jungle:!0,towers:!0,pits:!0,decor:!0,bush:!0,monsters:!0,walls:!0,base:!0,baseFocus:null,...Qe.clean,...s?s.layers:{}}),[h,m]=_.useState("clean"),[a,i]=_.useState("full"),[c,b]=_.useState("desktop"),[p,g]=_.useState(!1),[k,F]=_.useState({area:!0,lines:!0,pinch:!0,hero:!0,block:!0,ents:!0,nums:!1}),[S,H]=_.useState(null),[E,R]=_.useState(!1),f=Je[c],x=_.useMemo(()=>Rt(e,t),[e,t]),M=_.useMemo(()=>Dt(t),[t]),y=_.useMemo(()=>It(e,t),[e,t]),w=_.useMemo(()=>zt(e,t,r.field),[e,t,r]),$=_.useMemo(()=>{const d=O=>({x:220-O.x,y:220-O.y}),A=(O,ne)=>Math.hypot(O.x-ne.x,O.y-ne.y),N=[{id:"主堡",err:A(e.bases.blue,d(e.bases.red))},{id:"泉水",err:A(e.fountains.blue,d(e.fountains.red))}];return t.nexusTurrets.filter(O=>O.side==="blue").forEach(O=>{const ne=t.nexusTurrets.find(Z=>Z.side==="red"&&Z.id.slice(-1)===O.id.slice(-1));N.push({id:`門牙塔${O.id.slice(-1)}`,err:A(O,d(ne))})}),t.towers.filter(O=>O.side==="blue"&&O.kind==="highground").forEach(O=>{const ne=t.towers.find(Z=>Z.side==="red"&&Z.kind==="highground"&&Z.lane===de[O.lane]);N.push({id:`高地塔 ${O.lane}`,err:A(O,d(ne))})}),t.meta.bases.blue.gates.forEach((O,ne)=>{const Z=t.meta.bases.red.gates.find(lt=>lt.lane===de[O.lane]);N.push({id:`出口 ${O.lane}`,err:A(O,d(Z))})}),{rows:N,max:Math.max(...N.map(O=>O.err))}},[e,t]),L=d=>l(A=>({...A,[d]:!A[d]})),I=d=>{m(d),l(A=>({...A,...Qe[d]}))},P=d=>F(A=>({...A,[d]:!A[d]})),[v,C]=_.useState(null),j={lane:!1,jungle:!1,towers:!1,pits:!1,bush:!1,monsters:!1,decor:!1,walls:!1,base:!1,baseFocus:null},B={all:{label:"全部",show:{lane:!0,jungle:!0,towers:!0,pits:!0,bush:!0,monsters:!0,decor:!0,walls:!0,base:!0,baseFocus:null},pass:!1},monsters:{label:"只看野怪",show:{...j,pits:!0,monsters:!0},pass:!1},routes:{label:"只看可走路線",show:{...j,lane:!0,jungle:!0,walls:!0},pass:!0,opts:{area:!0,lines:!0,pinch:!1,hero:!1,block:!0,ents:!0,nums:!1}},walls:{label:"只看牆體",show:{...j,jungle:!0,pits:!0,walls:!0},pass:!1},bush:{label:"只看草叢",show:{...j,bush:!0},pass:!1},towers:{label:"只看塔",show:{...j,towers:!0},pass:!1},base:{label:"只看基地",show:{...j,base:!0},pass:!1},terrain:{label:"只看地表",show:{...j,lane:!0,jungle:!0,base:!0},pass:!1},collision:{label:"只看碰撞/最窄",show:{...j,lane:!0,jungle:!0,walls:!0},pass:!0,opts:{area:!0,lines:!1,pinch:!0,hero:!0,block:!0,ents:!1,nums:!1}},mirror:{label:"基地鏡射檢查",show:{...j,base:!0,walls:!0,towers:!0},pass:!1,sym:!0},basestruct:{label:"只看基地結構",show:{...j,base:!0,walls:!0,towers:!0,baseFocus:"struct"},pass:!1,sym:!0},basewall:{label:"只看基地牆體",show:{...j,base:!0,walls:!0,baseFocus:"wall"},pass:!1,sym:!0},basetower:{label:"只看基地塔",show:{...j,base:!0,towers:!0,baseFocus:"tower"},pass:!1,sym:!0},baseexit:{label:"只看基地出口",show:{...j,base:!0,towers:!0,baseFocus:"exit"},pass:!1,sym:!0},bpblue:{label:"只看藍方 blueprint",show:{...j,base:!0,walls:!0,towers:!0,baseFocus:"bp_blue"},pass:!1,sym:!1},bpred:{label:"只看紅方鏡射",show:{...j,base:!0,walls:!0,towers:!0,baseFocus:"bp_red"},pass:!1,sym:!1},bpoverlay:{label:"藍紅 overlay",show:{...j,base:!0,walls:!0,towers:!0,baseFocus:"bp_overlay"},pass:!1,sym:!1,bp:!0}},je=d=>{C(d),l(A=>({...A,...B[d].show})),g(B[d].pass),R(!!B[d].sym),B[d].opts&&F(A=>({...A,...B[d].opts})),String(B[d].show.baseFocus??"").startsWith("bp_")&&_e("blue")},_e=d=>{i(d);const A=u.current;if(!A)return;const{pos:N,tgt:O}=Tt[d];A.object.position.set(N[0],N[1],N[2]),A.object.near=1,A.object.far=4e3,A.object.updateProjectionMatrix(),A.target.set(O[0],O[1],O[2]),A.update()};_.useEffect(()=>{if(s)return;const d=setTimeout(()=>_e("full"),60);return()=>clearTimeout(d)},[s]);const Se=({id:d,label:A})=>n.jsx("button",{style:{...ee,outline:a===d?"2px solid #33c0d9":"none"},onClick:()=>_e(d),children:A}),K=({k:d,label:A})=>n.jsx("button",{style:{...ee,outline:o[d]?"2px solid #f29e38":"none"},onClick:()=>L(d),children:A}),Ue=({id:d,label:A})=>n.jsx("button",{style:{...ee,outline:h===d?"2px solid #7ee081":"none"},onClick:()=>I(d),children:A}),ke=({id:d})=>n.jsx("button",{style:{...ee,outline:c===d?"2px solid #b98cff":"none"},onClick:()=>b(d),children:Je[d].label}),te=({k:d,label:A})=>n.jsx("button",{style:{...ee,outline:k[d]?"2px solid #5fd08a":"none"},onClick:()=>P(d),children:A}),z=({id:d})=>n.jsx("button",{style:{...ee,outline:v===d?"2px solid #33c0d9":"none"},onClick:()=>je(d),children:B[d].label}),fe=_.useMemo(()=>{const d=r.routes.filter(N=>!N.meetsSpec),A=Math.min(...r.routes.map(N=>N.narrowest));return{total:r.routes.length,bad:d.length,narrowest:A}},[r]);return n.jsxs("div",{style:{position:"fixed",inset:0,background:"#0b0f14"},children:[n.jsxs(vt,{dpr:f.dpr,gl:{antialias:!0,powerPreference:"high-performance"},camera:{position:[0,430,118],fov:48,near:1,far:4e3},onCreated:({gl:d})=>{d.toneMapping=jt,d.toneMappingExposure=1.1},children:[n.jsx("color",{attach:"background",args:[922652]}),n.jsx("hemisphereLight",{args:[11979746,3356959,.85]}),n.jsx("ambientLight",{intensity:.22,color:16773597}),n.jsx("directionalLight",{position:[-180,330,220],intensity:2.3,color:16773324}),n.jsx("directionalLight",{position:[210,180,-160],intensity:.55,color:10470632}),n.jsx(Mt,{show:o,ring:f.ring,castTowerShadow:f.shadow}),p&&k.area&&n.jsx(Nt,{field:r.field}),p&&!s&&n.jsx(Gt,{L:e,T:t,PASS:r,opts:k}),E&&!s&&n.jsx(Vt,{L:e,T:t,exits:w.exits}),n.jsx(Yt,{onSample:H}),s?n.jsx(Ht,{spec:s,id:Be}):n.jsx(Et,{ref:u,makeDefault:!0,maxPolarAngle:Math.PI*.49})]},c),s?null:n.jsxs(n.Fragment,{children:[n.jsxs("div",{style:{position:"fixed",right:8,top:8,zIndex:60,minWidth:210,font:"12px ui-monospace,monospace",color:"#e7edf5",lineHeight:1.55,background:"rgba(10,14,20,.86)",border:"1px solid #2a3542",borderRadius:8,padding:"8px 10px"},children:[n.jsxs("div",{style:{fontWeight:700,marginBottom:3},children:["效能統計（",f.label,"）"]}),S?n.jsxs(n.Fragment,{children:[n.jsxs("div",{children:["FPS：",n.jsx("b",{style:{color:S.fps>=55?"#7ee081":S.fps>=30?"#ffd86b":"#ff6b6b"},children:S.fps.toFixed(0)}),"　幀時間 ",S.frameMs.toFixed(1),"ms"]}),n.jsxs("div",{children:["Draw calls：",n.jsx("b",{style:{color:S.calls<=120?"#7ee081":"#ffd86b"},children:S.calls}),"　三角面 ",(S.tris/1e3).toFixed(1),"k"]}),n.jsxs("div",{children:["Geometry：",S.geometries,"　Texture：",S.textures]}),n.jsxs("div",{children:["Program(材質)：",n.jsx("b",{style:{color:S.programs<=20?"#7ee081":"#ffd86b"},children:S.programs})]})]}):n.jsx("div",{children:"取樣中…"}),n.jsxs("div",{style:{marginTop:5,paddingTop:5,borderTop:"1px solid #2a3542"},children:["可走性：",fe.bad===0?n.jsxs("b",{style:{color:"#7ee081"},children:[fe.total," 條全達標"]}):n.jsxs("b",{style:{color:"#ff6b6b"},children:[fe.bad,"/",fe.total," 未達標"]}),n.jsxs("div",{children:["最窄淨寬 ",fe.narrowest.toFixed(2),"（英雄直徑 2.4）"]})]})]}),E&&n.jsxs("div",{style:{position:"fixed",right:8,top:152,zIndex:60,width:306,maxHeight:"62vh",overflowY:"auto",font:"11px ui-monospace,monospace",color:"#e7edf5",lineHeight:1.55,background:"rgba(10,14,20,.9)",border:"1px solid #2a3542",borderRadius:8,padding:"8px 10px"},children:[n.jsxs("div",{style:{fontWeight:700,marginBottom:4},children:["基地鏡射檢查　",x.ok?n.jsx("span",{style:{color:"#7ee081"},children:"✅ 藍紅完全對稱"}):n.jsx("span",{style:{color:"#ff6b6b"},children:"❌ 有不對稱項"})]}),n.jsxs("div",{style:{color:"#9fb3c8",marginBottom:4},children:[n.jsx("span",{style:{color:"#37e0ff"},children:"■ 青實線"}),"＝藍方結構｜",n.jsx("span",{style:{color:"#ff5ad6"},children:"■ 洋紅虛線"}),"＝紅方結構轉 180° 疊上來（重合＝對稱）",n.jsx("div",{children:"青圓＝藍方 blueprint 點｜洋紅圓＝紅方點轉 180°；超過 0.05 會轉紅並在畫面上標出誤差"}),n.jsx("div",{children:"畫面逐像素比對請跑：node tools/preview_base_symmetry.mjs"})]}),x.checks.map(d=>n.jsxs("div",{style:{display:"flex",justifyContent:"space-between",gap:6},children:[n.jsxs("span",{style:{color:d.ok?"#a9f0c6":"#ff9b8a"},children:[d.ok?"✅":"❌"," ",d.label]}),n.jsx("span",{style:{color:"#9fb3c8",whiteSpace:"nowrap"},children:Number.isFinite(d.err)?d.err:"—"})]},d.id)),n.jsx("div",{style:{marginTop:6,paddingTop:5,borderTop:"1px solid #2a3542",fontWeight:700},children:"blueprint 點對照（紅方轉 180° 後與藍方的距離）"}),$.rows.map(d=>n.jsxs("div",{style:{display:"flex",justifyContent:"space-between",gap:6},children:[n.jsxs("span",{style:{color:d.err<=.05?"#a9f0c6":"#ff9b8a"},children:[d.err<=.05?"✅":"❌"," ",d.id]}),n.jsx("span",{style:{color:"#9fb3c8"},children:d.err.toFixed(3)})]},d.id)),n.jsx("div",{style:{marginTop:6,paddingTop:5,borderTop:"1px solid #2a3542",fontWeight:700},children:"主堡區層級（距主堡，兩方相同）"}),y.sides.blue.rows.map(d=>n.jsxs("div",{style:{display:"flex",justifyContent:"space-between",gap:6},children:[n.jsx("span",{children:d.label}),n.jsxs("span",{style:{color:"#9fb3c8",whiteSpace:"nowrap"},children:[d.value.toFixed(1),"　",d.note]})]},d.id)),y.sides.blue.checks.filter(d=>!d.ok).map(d=>n.jsxs("div",{style:{color:"#ff9b8a"},children:["❌ ",d.label]},d.id)),n.jsxs("div",{style:{marginTop:6,paddingTop:5,borderTop:"1px solid #2a3542",fontWeight:700},children:["三路出口實測可走淨寬（下限 ",Oe,"）"]}),w.exits.map(d=>n.jsxs("div",{style:{display:"flex",justifyContent:"space-between",gap:6},children:[n.jsxs("span",{style:{color:d.ok?"#a9f0c6":"#ff9b8a"},children:[d.ok?"✅":"❌"," ",d.id]}),n.jsxs("span",{style:{color:"#9fb3c8"},children:["淨寬 ",d.width]})]},d.id)),n.jsx("div",{style:{marginTop:3,color:"#9fb3c8"},children:"※ 沿「主堡→城門→高地塔」中心線實測，非繞路連通性。英雄直徑 4.8。"})]}),String(o.baseFocus??"").startsWith("bp_")&&n.jsxs("div",{style:{position:"fixed",right:8,top:152,zIndex:60,width:320,maxHeight:"70vh",overflowY:"auto",font:"11px ui-monospace,monospace",color:"#e7edf5",lineHeight:1.55,background:"rgba(10,14,20,.9)",border:"1px solid #2a3542",borderRadius:8,padding:"8px 10px"},children:[n.jsxs("div",{style:{fontWeight:700,marginBottom:4},children:["base blueprint（G.15）　",M.ok?n.jsx("span",{style:{color:"#7ee081"},children:"✅ 紅方 100% 由藍方鏡射"}):n.jsx("span",{style:{color:"#ff6b6b"},children:"❌ 有不符項"})]}),n.jsxs("div",{style:{color:"#9fb3c8",marginBottom:5},children:["藍紅各 ",M.count," 件結構件，每件都有 stable id。",o.baseFocus==="bp_overlay"&&n.jsxs("div",{children:[n.jsx("span",{style:{color:"#ff6ad0"},children:"■ 洋紅"}),"＝紅方繞地圖中心轉 180° 疊上來； 完全被藍方蓋住＝兩邊一模一樣，看得到洋紅殘影＝該處不對稱。"]}),o.baseFocus==="bp_blue"&&n.jsx("div",{children:"目前只畫藍方 blueprint 本尊。"}),o.baseFocus==="bp_red"&&n.jsx("div",{children:"目前只畫紅方（＝藍方 blueprint 的鏡射輸出）。"})]}),M.rows.map(d=>n.jsxs("div",{style:{display:"flex",justifyContent:"space-between",gap:6},children:[n.jsxs("span",{style:{color:d.ok?"#a9f0c6":"#ff9b8a"},children:[d.ok?"✅":"❌"," ",d.label]}),n.jsx("span",{style:{color:"#9fb3c8",whiteSpace:"nowrap"},children:d.detail})]},d.id)),n.jsxs("div",{style:{marginTop:6,paddingTop:5,borderTop:"1px solid #2a3542",fontWeight:700},children:["出口可走淨寬（沿出口通道中心線實測，下限 ",Oe,"）"]}),w.exits.map(d=>n.jsxs("div",{style:{display:"flex",justifyContent:"space-between",gap:6},children:[n.jsxs("span",{children:[d.side," ",d.lane]}),n.jsx("span",{style:{color:d.ok?"#7ee081":"#ff6b6b"},children:d.width})]},d.id)),n.jsx("div",{style:{marginTop:3,color:"#9fb3c8"},children:"※ G.15-fix4：三個城門是**等角**配置（模組首尾相接），門的方位與「主堡→高地塔」 直線有數度差，通道走「主堡 → 內庭轉折點 → 城門 → 高地塔」的折線，淨寬沿這條折線量。 基地的每一段牆都出自同一份出口模組：沒有後翼牆、沒有另一圈三路共用的內牆。"})]}),p&&n.jsxs("div",{style:{position:"fixed",left:8,top:8,zIndex:60,maxWidth:300,font:"11px ui-monospace,monospace",color:"#e7edf5",lineHeight:1.6,background:"rgba(10,14,20,.88)",border:"1px solid #2a3542",borderRadius:8,padding:"8px 10px"},children:[n.jsx("div",{style:{fontWeight:700,marginBottom:3},children:"可走性圖例"}),n.jsxs("div",{children:[n.jsx("span",{style:{color:"#3ad17a"},children:"■ 綠地毯"}),"＝英雄實際可走區域（碰撞半徑 2.4）"]}),n.jsxs("div",{children:[n.jsx("span",{style:{color:"#5fd08a"},children:"— 綠線"}),"＝verifier ",n.jsx("b",{children:"測試路線"}),"（找得到 path 的證明線，",n.jsx("b",{children:"非"}),"正式英雄移動軌跡）"]}),n.jsxs("div",{children:[n.jsx("span",{style:{color:"#8fd0ff"},children:"○ 藍環"}),"＝該路線最窄處淨寬｜",n.jsx("span",{style:{color:"#ffe08a"},children:"○ 黃環"}),"＝英雄碰撞圓"]}),n.jsxs("div",{children:["深色岩壁＝blocking（擋路）｜草叢/樹/裝飾石＝",n.jsx("b",{children:"純視覺"}),"，不參與碰撞"]}),n.jsx("div",{style:{marginTop:3,color:"#9fb3c8"},children:"※ 綠地毯以外＝走不過去；關掉圖層時看綠地毯的連續性即可判斷野區好不好穿梭。"})]}),n.jsxs("div",{style:{position:"fixed",left:8,bottom:8,zIndex:60,display:"flex",flexWrap:"wrap",gap:6,alignItems:"center",maxWidth:"96vw",font:"12px ui-monospace,monospace",color:"#e7edf5",background:"rgba(10,14,20,.82)",border:"1px solid #2a3542",borderRadius:8,padding:"6px 8px"},children:[n.jsx("span",{style:{fontWeight:700},children:"MOBA 地圖原型（G.15 Base Blueprint Reset）"}),n.jsx("span",{children:"｜模式"}),n.jsx(Ue,{id:"clean",label:"純地圖"}),n.jsx(Ue,{id:"debug",label:"Debug 標記"}),n.jsx("span",{style:{width:"100%"}}),n.jsx("span",{children:"｜只看"}),n.jsx(z,{id:"all"}),n.jsx(z,{id:"routes"}),n.jsx(z,{id:"walls"}),n.jsx(z,{id:"bush"}),n.jsx(z,{id:"monsters"}),n.jsx(z,{id:"towers"}),n.jsx(z,{id:"base"}),n.jsx(z,{id:"terrain"}),n.jsx(z,{id:"collision"}),n.jsx(z,{id:"mirror"}),n.jsx("span",{style:{width:"100%"}}),n.jsx("span",{children:"｜基地"}),n.jsx(z,{id:"basestruct"}),n.jsx(z,{id:"basewall"}),n.jsx(z,{id:"basetower"}),n.jsx(z,{id:"baseexit"}),n.jsx("span",{style:{width:"100%"}}),n.jsx("span",{children:"｜blueprint"}),n.jsx(z,{id:"bpblue"}),n.jsx(z,{id:"bpred"}),n.jsx(z,{id:"bpoverlay"}),n.jsx("span",{children:"｜Preset"}),n.jsx(ke,{id:"desktop"}),n.jsx(ke,{id:"mobile"}),n.jsx(ke,{id:"low"}),n.jsx("span",{children:"｜視角"}),n.jsx(Se,{id:"full",label:"完整"}),n.jsx(Se,{id:"blue",label:"藍方"}),n.jsx(Se,{id:"red",label:"紅方"}),n.jsx("span",{children:"｜圖層"}),n.jsx(K,{k:"lane",label:"三路"}),n.jsx(K,{k:"jungle",label:"野區"}),n.jsx(K,{k:"towers",label:"塔"}),n.jsx(K,{k:"pits",label:"龍/巴龍"}),n.jsx(K,{k:"bush",label:"草叢"}),n.jsx(K,{k:"monsters",label:"野怪"}),n.jsx(K,{k:"labels",label:"標籤"}),n.jsx(K,{k:"decor",label:"裝飾岩"}),n.jsx(K,{k:"coords",label:"座標"}),n.jsx("span",{style:{width:"100%"}}),n.jsxs("button",{style:{...ee,outline:p?"2px solid #5fd08a":"none",fontWeight:700},onClick:()=>g(d=>!d),children:["可走性圖層 ",p?"開":"關"]}),n.jsxs("button",{style:{...ee,outline:E?"2px solid #ff5ad6":"none",fontWeight:700},onClick:()=>R(d=>!d),children:["基地鏡射檢查 ",E?"開":"關"]}),p&&n.jsxs(n.Fragment,{children:[n.jsx(te,{k:"area",label:"可走區域(綠)"}),n.jsx(te,{k:"lines",label:"測試路線"}),n.jsx(te,{k:"pinch",label:"最窄通道"}),n.jsx(te,{k:"hero",label:"英雄碰撞圓"}),n.jsx(te,{k:"block",label:"阻擋區"}),n.jsx(te,{k:"ents",label:"營地入口"}),n.jsx(te,{k:"nums",label:"牆鏈編號"})]})]})]})]})}export{Be as SHOT_ID,Qt as default};

var mouseDown = false;
var mousePageX = 0;
var mousePageY = 0;
var mouseGridX = 0;
var mouseGridY = 0;
var shiftKeyDown = false;
var currentTool = 'select';
var windowWidth = 0;
var windowHeight = 0;
var polygons = [];
var selectedPolygonIndex = -1;
var selectedPoints = [];
var newPoly;
var bounds;
var windingAnimParams;
var triangAnimParams;
var rectAnimParams;

var centerCoord = [0, 0];
//var cellSize = 10;
var pixelsPerCoord = 25;

function resetAnimParams() {
	windingAnimParams = {
		rayProgress: 0,
		rayHeight: 0,
		currentEdge: 0,
		edgeProgress: 0,
		intersectionTime: 0,
		intersectionDirection: 0,
		windingNumber: 0,
		intersectionList: [],
		intersectionListIndex: 0,
		animationSpeed: 0.002
	};
	triangAnimParams = {
		diagonals: [],
		subcalls: [],
		done: false,
		animStepTime: 400
	};
	rectAnimParams = {
		P: [],
		S: [],
		V: [],
		iV: 0,
		t: 0,
		fences: [],
		stage: 'selectpoly',
		polyalpha: 1,
		gridalpha: 1,
		animStepTime: 400,
		reduceEdge: -1,
		done: false
	};
}

resetAnimParams();

class SegmentGraph {
	constructor() {
		this.segmap = {};
		this.backedges = {};
	}

	add(seg, x) {
		if (this.segmap[JSON.stringify(seg)]) {
			this.segmap[JSON.stringify(seg)].push(x);
		} else {
			this.segmap[JSON.stringify(seg)] = [x];
		}
		if (this.backedges[JSON.stringify(x)]) {
			this.backedges[JSON.stringify(x)].push(seg);
		} else {
			this.backedges[JSON.stringify(x)] = [seg];
		}
	}

	get(seg) {
		let res = this.segmap[JSON.stringify(seg)];
		if (res) {
			return res;
		} else {
			return [];
		}
	}

	remove(n, m) {
		let compare;
		if (isNaN(n)) compare = compareSegments;
		else compare = (a, b) => a == b;
		let entry = this.segmap[JSON.stringify(n)];
		if (entry) {
			this.segmap[JSON.stringify(n)] = entry.filter(s => !compare(s, m));
		}

		entry = this.backedges[JSON.stringify(m)];
		if (entry) {
			let i = entry.findIndex(s => compare(s, n));
			if (i != -1) {
				this.backedges[JSON.stringify(m)] = entry.filter(s => !compare(s, n));
			}
		}
	}

	keys() {
		return Object.keys(this.segmap).map(x => JSON.parse(x));
	}

	topsort() {
		let L = [];
		let S = this.keys();
		// console.log(this.backedges);
		for (let i = S.length - 1; i > 0; i--) {
			// console.log(S[i], this.backedges[S[i]]);
			if (this.backedges[JSON.stringify(S[i])] || this.backedges[JSON.stringify([S[i][1], S[i][0]])]) {
				S.splice(i, 1);
			}
		}

		while (S.length > 0) {
			let n = S.pop();
			L.push(n);
			// console.log('added', JSON.stringify(n), 'to topological ordering');
			for (let m of this.get(n)) {
				this.remove(n, m);
				let be = this.backedges[JSON.stringify(m)];
				// console.log('testing', JSON.stringify(m), be);
				if (!be || be.length == 0) {
					S.push(m);
				}
			}
		}

		// console.log(this.segmap, this.backedges);

		return L;
	}
}

function windingNumber(P, o) {
	let wind = 0;
	let n = P.length;
	for (let i = 0; i < n; i++) {
		let p = P[i];
		let q = P[(i + 1) % n];
		//console.log(`edge from ${p} to ${q}`);
		let d = (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
		//console.log('delta:', d)
		if (p[0] <= o[0] && o[0] < q[0] && d > 0) {
			//console.log('winding number increased')
			wind += 1;
		} else if (q[0] <= o[0] && o[0] < p[0] && d < 0) {
			wind -= 1;
			//console.log('winding number decreased')
		}
	}

	return wind;
}

function updateWinding(dt=0) {
	let w = windingAnimParams;
	displayInfo('Winding Number: ' + w.windingNumber);
	if (selectedPolygonIndex == -1) {
		if (polygons.length == 1) {
			selectedPolygonIndex = 0;
		} else if (polygons.length == 0) {
			displayInfo('Draw a polygon first');
		} else {
			displayInfo('Select a polygon');
		}
	} else if (selectedPoints.length == 0) {
		displayInfo('Select a point');
	} else {
		if (isOnPath(polygons[selectedPolygonIndex], selectedPoints[0])) {
			displayInfo('Point must not be on polygon boundary');
			return;
		} else if (w.rayHeight == 0) {
			let min = polygons[selectedPolygonIndex][0][1];
			for (let [x, y] of polygons[selectedPolygonIndex]) {
				if (y < min) min = y;
			}
			w.rayHeight = min - selectedPoints[0][1] - 2;
			if (w.rayHeight > 0) w.rayHeight = -2;
		}
		if (w.rayProgress < 1) {
			w.rayProgress += w.animationSpeed * dt;
		} else {
			if (w.currentEdge < polygons[selectedPolygonIndex].length) {
				if (w.edgeProgress > 1) {
					w.currentEdge++;
					w.edgeProgress = 0;
				}
				if (w.currentEdge >= polygons[selectedPolygonIndex].length) {
					// done
				} else {
					if (w.edgeProgress == 0) {
						let P = polygons[selectedPolygonIndex];
						let n = P.length;
						let i = w.currentEdge;
						let o = selectedPoints[0];
						o[0] += 0.0001; // perturb
						let p = P[i];
						let q = P[(i + 1) % n];
						let d = (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
						let change = 0;
						if (p[0] <= o[0] && o[0] < q[0] && d > 0) {
							change = 1;
						} else if (q[0] <= o[0] && o[0] < p[0] && d < 0) {
							change = -1;
						}
						if (change != 0) {
							w.intersectionTime = (o[0] - p[0]) / (q[0] - p[0]);
							w.intersectionDirection = change;
							w.intersectionList.push([[o[0], p[1] + w.intersectionTime * (q[1] - p[1])], change == 1 ? '+' : '-']);
							//console.log('edge from', p, 'to', q, 'crosses', change);
						} else {
							w.intersectionTime = 0;
							w.intersectionDirection = 0;
							//console.log('edge from', p, 'to', q, 'does not cross');
						}
					}

					let prev = w.edgeProgress;
					w.edgeProgress += w.animationSpeed * dt;
					if (prev < w.intersectionTime && w.edgeProgress > w.intersectionTime) {
						w.windingNumber += w.intersectionDirection;
						w.intersectionListIndex++;
					}
				}
			}
		}
		
	}
}

function newTriangulationSubcall(p) {
	triangAnimParams.subcalls.push({
		P: p,
		i: 0,
		j: 2,
		k: 0,
		d: true,
		t: 0,
		done: false
	});
}

function updateTriangulate(dt=0) {
	displayInfo('');
	let t = triangAnimParams;
	if (selectedPolygonIndex == -1) {
		if (polygons.length == 1 && polygons[0].length > 3 && !isSelfIntersecting(polygons[0])) {
			selectedPolygonIndex = 0;
		} else if (polygons.length == 0) {
			displayInfo('Draw a polygon first');
		} else {
			displayInfo('Select a simple polygon (>3 vertices)');
		}
	} else if (polygons[selectedPolygonIndex].length <= 3) {
		displayInfo('Selected polygon is a triangle!');
	} else if (isSelfIntersecting(polygons[selectedPolygonIndex])) {
		displayInfo('Selected polygon is self-intersecting!');
	} else if (t.done) {

	} else {
		if (t.subcalls.length == 0) {
			newTriangulationSubcall(polygons[selectedPolygonIndex]);
		}

		for (let s of t.subcalls) {
			let n = s.P.length;
			if (n <= 3) {
				s.done = true;
				//console.log('subcall of size', n, 'finished');
			} else if (s.t < t.animStepTime) {
				s.t += dt;
			} else {
				//console.log(n, s)
				s.t = 0;
				let r = intersect(s.P[s.i], s.P[s.j % n], s.P[s.k], s.P[(s.k + 1) % n]);
				//console.log('checking if', s.P[s.i], s.P[s.j % n], 'intersects with', s.P[s.k], s.P[(s.k + 1) % n]);
				//console.log(r);
				s.d = s.d & !r;

				s.k++;
				if (s.k >= n || !s.d) {
					let midx = (s.P[s.i][0] + s.P[s.j][0]) / 2;
					let midy = (s.P[s.i][1] + s.P[s.j][1]) / 2;
					if (s.d && windingNumber(s.P, [midx, midy]) != 0) {
						t.diagonals.push([s.P[s.i], s.P[s.j]]);
						s.done = true;
						//console.log('subcall of size', n, 'finished');
						newTriangulationSubcall(s.P.slice(0, s.i + 1).concat(s.P.slice(s.j, n)));
						newTriangulationSubcall(s.P.slice(s.i, s.j+1));
					} else {
						s.d = true;
						s.k = 0;
						s.j++;
						if (s.j > s.i + n - 2) {
							s.i++;
							if (s.i >= n) {
								console.log('Failed to find a triangulation'); // this should be impossible
								s.done = true;
							}
							s.j = s.i + 2;
						}
					}
				}
			}
		}

		t.subcalls = t.subcalls.filter(x => !x.done);
		if (t.subcalls.length == 0) {
			t.done = true;
		}
	}
}

function updateRectification(dt=0) {
	let r = rectAnimParams;
	if (r.stage == 'selectpoly') {
		if (selectedPolygonIndex == -1) {
			if (polygons.length == 1) {
				selectedPolygonIndex = 0;
				r.P = polygons[selectedPolygonIndex].slice();
				r.stage = 'selectpoints';
				displayInfo('Select obstacle points (Enter to confirm)');

			} else if (polygons.length == 0) {
				displayInfo('Draw a polygon first');
			} else {
				displayInfo('Select a polygon');
			}
		} else {
			r.P = polygons[selectedPolygonIndex].slice();
			perturb(r.P);
			r.stage = 'selectpoints';
			displayInfo('Select obstacle points (Enter to confirm)');
		}
	}

	if (r.stage == 'selectpoints') {
		
	} else if (r.stage == 'init') {
		while (true) {
			let intersection = selfIntersection(r.P, true);
			if (!intersection) {
				break;
			}

			// console.log(intersection);
			let [pt, edge] = intersection;
			let [e1, e2] = edge.sort((a, b) => b - a);
			r.P.splice(e1 + 1, 0, pt.slice());
			r.P.splice(e2 + 1, 0, pt.slice());
		}

		r.S = segments(r.P).concat(selectedPoints.map(p => [p, p]));
		r.G = new SegmentGraph();
		r.V = new Set();
		for (let s of r.S) {
			r.V.add(String(s[0]));
			r.V.add(String(s[1]));
		}
		r.V = [...r.V.keys()].map(x => x.split(',').map(y => parseFloat(y))).sort((a, b) => a[0] - b[0]); // sort vertices by x coordinate

		r.stage = 'postinit';
	} else if (r.stage == 'postinit') {
		r.polyalpha -= dt / 400;
		if (r.polyalpha < 0) {
			r.polyalpha = 0;
			r.stage = 'trap';
		}
	} else if (r.stage == 'trap') {
		if (r.t == 0) {
			let p = r.V[r.iV];
			let [x, y] = p;
			let minAbove;
			let minAboveY = Infinity;
			let minBelow;
			let minBelowY = -Infinity;
			for (let s of r.S) {
				let [p1, p2] = s;
				let point = intersectsVertical(p1, p2, x);
				if (point) {
					let [px, py] = point;
					if (py > y && py < minAboveY) {
						minAboveY = py;
						minAbove = s;
					}
					if (py < y && py > minBelowY) {
						minBelowY = py;
						minBelow = s;
					}
				}
			}

			//console.log(p, minBelow, minAbove);

			if (!isFinite(minBelowY)) minBelowY = y;
			if (!isFinite(minAboveY)) minAboveY = y;
			if (minBelowY != minAboveY) {
				r.fences.push([[x, minBelowY], [x, minAboveY]]);
			}
			
			for (let s of r.S) {
				if (comparePoints(s[0], p) || comparePoints(s[1], p)) {
					if (minAbove && minAbove != y) r.G.add(minAbove, s);
					if (minBelow && minBelow != y) r.G.add(s, minBelow);
				}
			}
		}
		if (r.t < r.animStepTime) {
			r.t += dt;
		} else {
			r.t = 0;
			r.iV++;
			if (r.iV >= r.V.length) {
				r.ordering = r.G.topsort();

				let obsbelow = 0;
				r.vrank = [];
				for (let i = r.ordering.length - 1; i >= 0; i--) {
					let seg = r.ordering[i];
					if (comparePoints(seg[0], seg[1])) {
						r.vrank.unshift(2 * obsbelow + 1);
						obsbelow++;
					} else {
						r.vrank.unshift(2 * obsbelow);
					}
				}

				for (let entry of r.V) {
					if (selectedPoints.find(x => comparePoints(entry, x))) {
						entry.push(1);
					}
				}
				let obsleft = 0;
				r.hrank = [];
				for (let v of r.V) {
					if (v[2]) {
						r.hrank.push(2 * obsleft + 1);
						obsleft++;
					} else {
						r.hrank.push(2 * obsleft);
					}
				}
				
				r.t = 0;
				r.Pstart = [];
				r.Ptarget = [];
				let P = r.P;
				let n = P.length;
				for (let i = 0; i < n; i++) {
					let pp = P[i];
					let pq = P[(i+1)%n];
					let pr = P[(i+2)%n];
					let vrankpq = r.vrank[r.ordering.findIndex(seg => compareSegments(seg, [pp, pq]))];
					let hrankq = r.hrank[r.V.findIndex(pt => comparePoints(pt, pq))];
					let vrankqr = r.vrank[r.ordering.findIndex(seg => compareSegments(seg, [pq, pr]))];
					// console.log(vrankpq, hrankq, vrankqr);
					r.Pstart.push(pq.slice());
					r.Pstart.push(pq.slice());
					r.Ptarget.push([hrankq, vrankpq]);
					r.Ptarget.push([hrankq, vrankqr]);
				}
				
				calculatePerturbances(r);

				r.Otarget = [];
				for (let p of selectedPoints) {
					let hranko = r.hrank[r.V.findIndex(pt => comparePoints(p, pt))];
					let vranko = r.vrank[r.ordering.findIndex(seg => compareSegments(seg, [p, p]))];
					r.Otarget.push([hranko, vranko]);
				}

				r.stage = 'rectify';
			}
		}
	} else if (r.stage == 'rectify') {
		r.t += 0.4 / r.animStepTime;
		r.gridalpha = Math.max(0, r.gridalpha - 0.8 / r.animStepTime);

		if (r.t > 1) {
			r.t = 0;
			r.stage = 'reduce';
		}
	} else if (r.stage == 'reduce') {
		if (r.t == 0) {
			let [result, resultType] = findReducibleEdge(r.Ptarget, r.Otarget, r.startingVertical);
			r.reduceEdge = result;
			r.reductionType = resultType;
			if (result != -1) {
				console.log('found removable edge', result, resultType);
			} else {
				r.done = true;
				console.log('done');
			}
		}
		r.t += 0.8 / r.animStepTime;
		if (r.t > 1) {
			let i = r.reduceEdge;
			let j = (r.reduceEdge + 1) % r.Ptarget.length;
			if (r.reductionType == 'elide') {
				console.log('eliding edge', i);
				if (i == r.Ptarget.length - 1) {
					r.Ptarget.splice(i, 1);
					r.Ptarget.splice(0, 1);
				} else {
					r.Ptarget.splice(i, 2);
				}
			} else if (r.reductionType == 'rightslide') {
				r.Ptarget[i][0] += 2;
				r.Ptarget[j][0] += 2;
			} else if (r.reductionType == 'leftslide') {
				r.Ptarget[i][0] -= 2;
				r.Ptarget[j][0] -= 2;
			} else if (r.reductionType == 'upslide') {
				r.Ptarget[i][1] += 2;
				r.Ptarget[j][1] += 2;
			} else if (r.reductionType == 'downslide') {
				r.Ptarget[i][1] -= 2;
				r.Ptarget[j][1] -= 2;
			}
			
			calculatePerturbances(r);
			r.t = 0;
		}
	}
}

function toolButtonSelected(toolBtn, toolName) {
	let prevTool = currentTool;
	currentTool = toolName;
	$('.btn').removeClass('selected');
	$(toolBtn).addClass('selected');

	if (toolName != 'poly') {
		newPoly = null;
	}

	hideInfo();
	selectedPoints = [];

	if (prevTool != currentTool) {
		resetAnimParams();
	}

	if (toolName == 'winding') {
		updateWinding();
	}

	if (toolName == 'triangulate') {
		updateTriangulate();
	}

	if (toolName == 'rectification') {
		updateRectification();
	}
}

function displayInfo(text) {
	$('#info').html(text);
	$('#info').show();
}

function hideInfo() {
	$('#info').hide();
}

function selectPolygon(x, y, deselect=true) {
	let n = polygons.length;
	for (let i = 1; i <= n; i++) {
		let j = (selectedPolygonIndex + i) % n;
		let poly = polygons[j];
		if (isOnPath(poly, [x, y])) {
			if (j == selectedPolygonIndex) {
				return false;
			}
			selectedPolygonIndex = j;
			return true;
		}
	}
	if (deselect) {
		selectedPolygonIndex = -1;
	}
	
	return false;
}

function gridConvert(px, py) {
	return [(px - windowWidth / 2) / pixelsPerCoord + centerCoord[0], 
			(windowHeight / 2 - py) / pixelsPerCoord + centerCoord[1]];
}

var prevTime = 0;

function loop(curTime) {
	let dt = curTime - prevTime;
	prevTime = curTime;	
	update(dt);
	render(dt);
	window.requestAnimationFrame(loop);
}

function update(dt) {
	let minX = (-windowWidth / 2) / pixelsPerCoord + centerCoord[0];
	let maxX = (windowWidth / 2) / pixelsPerCoord + centerCoord[0];
	let minY = (-windowHeight / 2) / pixelsPerCoord + centerCoord[1];
	let maxY = (windowHeight / 2) / pixelsPerCoord + centerCoord[1];
	bounds = [minX, maxX, minY, maxY];

	if (currentTool == 'winding') {
		updateWinding(dt);
	} else if (currentTool == 'triangulate') {
		updateTriangulate(dt);
	} else if (currentTool == 'rectification') {
		updateRectification(dt);
	}
}

function renderWinding(ctx) {
	drawDefaults(ctx);
	let w = windingAnimParams;
	ctx.fillStyle = 'rgba(0, 0, 255, 1)';
	ctx.strokeStyle = 'rgba(0, 0, 255, 0.5)';
	if (selectedPoints[0]) {
		let [x, y] = selectedPoints[0];
		let rayHeight = w.rayProgress * w.rayHeight;
		ctx.beginPath();
		ctx.arc(x, y, 1 / pixelsPerCoord * 3, 0, 2 * Math.PI);
		ctx.fill();
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.lineTo(x, y + rayHeight);
		ctx.moveTo(x - 4 / pixelsPerCoord, y + rayHeight + 4 / pixelsPerCoord);
		ctx.lineTo(x, y + rayHeight);
		ctx.lineTo(x + 4 / pixelsPerCoord, y + rayHeight + 4 / pixelsPerCoord);
		ctx.stroke();

		if (w.rayProgress >= 1) {
			let poly = polygons[selectedPolygonIndex];
			if (w.currentEdge < poly.length) {
				ctx.strokeStyle = 'rgb(0, 255, 0)';
				ctx.lineWidth = 3 / pixelsPerCoord;
				ctx.beginPath();
				ctx.moveTo(poly[0][0], poly[0][1]);
				for (let i = 1; i <= w.currentEdge; i++) {
					ctx.lineTo(poly[i][0], poly[i][1]);
				}
				
				let p = poly[w.currentEdge];
				let q = poly[(w.currentEdge + 1) % poly.length];
				ctx.lineTo(p[0] + (q[0] - p[0]) * w.edgeProgress, p[1] + (q[1] - p[1]) * w.edgeProgress);

				ctx.stroke();
			} else if (w.currentEdge == poly.length) {
				ctx.strokeStyle = 'rgb(0, 255, 0)';
				ctx.lineWidth = 3 / pixelsPerCoord;
				drawPolygon(ctx, poly);
			}

			ctx.save();
			ctx.strokeStyle = '#000';
			ctx.lineWidth = 1 / pixelsPerCoord;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.font = (15 / pixelsPerCoord) + 'px sans-serif';
			ctx.globalAlpha = 0.8;
			for (let i = 0; i < w.intersectionListIndex; i++) {
				let p = w.intersectionList[i][0];
				ctx.beginPath();
				ctx.arc(p[0], p[1], 10 / pixelsPerCoord, 0, 2 * Math.PI);
				ctx.fillStyle = '#FFF';
				ctx.fill();
				ctx.stroke();
				ctx.fillStyle = '#000';
				ctx.fillText(w.intersectionList[i][1], p[0], p[1]);
			}
			ctx.restore();
		}
	}

	renderCursor(ctx);
}

function renderTriangulate(ctx) {
	drawDefaults(ctx);
	let t = triangAnimParams;
	ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
	ctx.beginPath();
	for (let [p1, p2] of t.diagonals) {
		ctx.moveTo(...p1);
		ctx.lineTo(...p2);
	}
	ctx.stroke();

	if (!t.done) {
		for (let s of t.subcalls) {
			let n = s.P.length;

			ctx.strokeStyle = 'rgba(0, 0, 255, 0.8)';
			ctx.beginPath();
			ctx.moveTo(...s.P[s.i]);
			ctx.lineTo(...s.P[s.j%n]);
			ctx.stroke();

			ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
			ctx.beginPath();
			ctx.moveTo(...s.P[s.k]);
			ctx.lineTo(...s.P[(s.k+1) % n]);
			ctx.stroke();
		}
	}

	renderCursor(ctx);
}

function renderRectification(ctx) {
	let r = rectAnimParams;
	//$('#debug').html(r.stage);
	if (r.stage == 'selectpoly' || r.stage == 'selectpoints') {
		drawDefaults(ctx);
		ctx.fillStyle = 'rgba(0, 0, 255, 1)';
		drawPoints(ctx, selectedPoints);
		renderCursor(ctx);
	} else {
		ctx.globalAlpha = r.gridalpha;
		drawGrid(ctx);
		ctx.globalAlpha = r.polyalpha;
		drawPolys(ctx);
		ctx.globalAlpha = 1;
		ctx.lineWidth = 2 / pixelsPerCoord;

		if (r.stage == 'postinit') {
			ctx.globalAlpha = 1 - r.polyalpha;
			ctx.strokeStyle = 'blue';
			drawSegments(ctx, r.S);
			ctx.globalAlpha = 1;
			ctx.fillStyle = 'black';
			drawSegmentPoints(ctx, r.S);
		} else if (r.stage == 'trap') {
			ctx.strokeStyle = 'blue';
			drawSegments(ctx, r.S);

			ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
			ctx.beginPath();
			for (let [p1, p2] of r.fences) {
				ctx.moveTo(...p1);
				ctx.lineTo(...p2);
			}
			ctx.stroke();

			if (r.V[r.iV]) {
				ctx.strokeStyle = 'rgba(255, 0, 0, 1)';
				ctx.beginPath();
				ctx.moveTo(r.V[r.iV][0], bounds[2]);
				ctx.lineTo(r.V[r.iV][0], bounds[3]);
				ctx.stroke();
			}

			ctx.fillStyle = 'black';
			drawSegmentPoints(ctx, r.S);
		} else if (r.stage == 'rectify') {
			ctx.strokeStyle = 'blue';
			//console.log(x0, y0, dim, bounds);
			let polyInterp = [];
			for (let i = 0; i < r.Pstart.length; i++) {
				let p0 = r.Pstart[i];
				let [p1x, p1y] = rankToGrid(r.Ptarget[i], i);
				//console.log('pre:', r.Ptarget[i]);
				//console.log('actual:', p1x, p1y);
				let pInterp = [r.t * (p1x - p0[0]) + p0[0], r.t * (p1y - p0[1]) + p0[1]];
				polyInterp.push(pInterp);
			}

			drawPolygon(ctx, polyInterp);

			let rectifiedPts = [];
			for (let i = 0; i < r.Otarget.length; i++) {
				let p0 = selectedPoints[i];
				let [p1x, p1y] = rankToGrid(r.Otarget[i]);
				//console.log('pre:', r.Ptarget[i]);
				//console.log('actual:', p1x, p1y);
				let pInterp = [r.t * (p1x - p0[0]) + p0[0], r.t * (p1y - p0[1]) + p0[1]];
				rectifiedPts.push(pInterp);
			}

			ctx.fillStyle = 'black';
			drawPoints(ctx, rectifiedPts);
		} else if (r.stage == 'reduce') {
			ctx.strokeStyle = 'blue';
			
			let rectified = [];
			for (let i = 0; i < r.Ptarget.length; i++) {
				rectified.push(rankToGrid(r.Ptarget[i], i));
			}
			drawPolygon(ctx, rectified);

			if (!r.done && r.reduceEdge != -1 && r.Ptarget[r.reduceEdge]) {
				let p0 = rankToGrid(r.Ptarget[r.reduceEdge], r.reduceEdge);
				let p1 = rankToGrid(r.Ptarget[(r.reduceEdge + 1) % r.Ptarget.length], (r.reduceEdge + 1) % r.Ptarget.length);
				//console.log('drawing reducible edge', p0, p1);
				ctx.strokeStyle = 'red';
				ctx.beginPath();
				ctx.moveTo(...p0);
				ctx.lineTo(...p1);
				ctx.stroke();
			}

			let rectifiedPts = [];
			for (let i = 0; i < r.Otarget.length; i++) {
				//console.log(r.Otarget, i, r.Otarget[i]);
				rectifiedPts.push(rankToGrid(r.Otarget[i]));
			}

			ctx.fillStyle = 'black';
			drawPoints(ctx, rectifiedPts);
		}

		renderCursor(ctx);
	}
}

function rankToGrid(p, i=-1) {
	let [p1x, p1y] = p;
	let r = rectAnimParams;
	let k = selectedPoints.length;
	let dim = Math.min(0.75*(bounds[3] - bounds[2]), 0.75*(bounds[1] - bounds[0]));
	let x0 = bounds[0] + (bounds[1] - bounds[0] - dim) / 2;
	let y0 = bounds[2] + (bounds[3] - bounds[2] - dim) / 2;
	let amountPerPerturb = dim / k / 30;
	let petx = 0;
	let pety = 0;
	if (i != -1) {
		petx = amountPerPerturb * r.perturbance[i][0];
		pety = amountPerPerturb * r.perturbance[i][1];
	}
	return [p1x * dim / 2 / k + x0 + petx, p1y * dim / 2 / k + y0 + pety];
}

function drawDefaults(ctx) {
	drawGrid(ctx);
	drawPolys(ctx);
}

function renderCursor(ctx, style='rgba(255, 0, 0, 0.5)') {
	ctx.fillStyle = style;
	ctx.beginPath();
	ctx.arc(Math.round(mouseGridX), Math.round(mouseGridY), 4 / pixelsPerCoord, 0, 2 * Math.PI);
	ctx.fill();
}

function updateMouseCoords() {
	$('#coords').html(`(${Math.round(mouseGridX)}, ${Math.round(mouseGridY)})`);
}

function render() {
	let canvas = document.getElementById('canvas');
	let ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, windowWidth, windowHeight);
	ctx.save();
	ctx.translate(windowWidth / 2, windowHeight / 2);
	ctx.scale(pixelsPerCoord, -pixelsPerCoord);
	ctx.translate(-centerCoord[0], -centerCoord[1]);

	if (currentTool == 'select' || currentTool == 'poly') {
		drawDefaults(ctx);
		renderCursor(ctx);
	} else if (currentTool == 'winding') {
		renderWinding(ctx);
	} else if (currentTool == 'triangulate') {
		renderTriangulate(ctx);
	} else if (currentTool == 'rectification') {
		renderRectification(ctx);
	}

	updateMouseCoords();
	ctx.restore();
}

function drawGrid(ctx) {
	let [minX, maxX, minY, maxY] = bounds;
	let onepx = 1 / pixelsPerCoord;

	ctx.strokeStyle = '#DDD';
	ctx.lineWidth = onepx;
	ctx.beginPath();
	for (let i = Math.floor(minX); i <= Math.ceil(maxX); i += 1) {
		ctx.moveTo(i, minY);
		ctx.lineTo(i, maxY);
	}

	for (let j = Math.floor(minY); j <= Math.ceil(maxY); j += 1) {
		ctx.moveTo(minX, j);
		ctx.lineTo(maxX, j);
	}

	ctx.stroke();
}

function drawPolys(ctx) {
	ctx.lineJoin = 'round';
	ctx.strokeStyle = '#00F';
	ctx.lineWidth = 2 / pixelsPerCoord;
	if (newPoly && newPoly.length > 0) {
		drawPolygon(ctx, newPoly, false);
		ctx.beginPath();
		ctx.moveTo(...newPoly[newPoly.length - 1]);
		ctx.lineTo(Math.round(mouseGridX), Math.round(mouseGridY));
		ctx.stroke();
		drawPoints(ctx, newPoly);
	}

	ctx.lineWidth = 2 / pixelsPerCoord;
	for (let i = 0; i < polygons.length; i++) {
		let poly = polygons[i];
		if (!shouldDrawPolygon(poly)) continue;
		ctx.strokeStyle = i == selectedPolygonIndex ? '#F00' : '#00F';
		drawPolygon(ctx, poly);
		if (i == selectedPolygonIndex) {
			drawPolygonDirection(ctx, poly);
		}
		ctx.strokeStyle = '#000';
		drawPoints(ctx, poly);
	}
}


function shouldDrawPolygon(poly) {
	let inbounds = false;

	for (let [x, y] of poly) {
		if (x > bounds[0] && x < bounds[1] && y > bounds[2] && y < bounds[3]) {
			inbounds = true;
		}
	}

	return inbounds;
}

function drawPolygon(ctx, poly, complete=true) {
	ctx.beginPath();
	for (let [x, y] of poly) {
		ctx.lineTo(x, y);
	}

	if (complete) {
		ctx.closePath();
	}

	ctx.stroke();
}

function drawSegments(ctx, segs) {
	ctx.beginPath();
	for (let [p1, p2] of segs) {
		ctx.moveTo(...p1);
		ctx.lineTo(...p2);
	}

	ctx.stroke();
}

function drawSegmentPoints(ctx, segs) {
	for (let ps of segs) {
		for (let [x, y] of ps) {
			ctx.beginPath();
			ctx.arc(x, y, 3 / pixelsPerCoord, 0, 2 * Math.PI);
			ctx.fill();
		}
	}
}

function drawPolygonDirection(ctx, poly) {
	let n = poly.length;
	let d = ctx.lineWidth;
	for (let i = 0; i < n; i++) {
		let p = poly[i];
		let q = poly[(i + 1) % n];
		let x = (p[0] + q[0]) / 2;
		let y = (p[1] + q[1]) / 2;
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(Math.atan2(q[1] - p[1], q[0] - p[0]));
		ctx.beginPath();
		ctx.moveTo(-2*d, 2*d);
		ctx.lineTo(0, 0);
		ctx.lineTo(-2*d, -2*d);
		ctx.stroke();
		ctx.restore();
	}
}

function drawPoints(ctx, points) {
	for (let [x, y] of points) {
		ctx.beginPath();
		ctx.arc(x, y, 3 / pixelsPerCoord, 0, 2 * Math.PI);
		ctx.fill();
	}
}

function resizeWindow() {
	windowWidth = $(window).width();
	windowHeight = $(window).height();
	$('canvas').attr('width', windowWidth);
	$('canvas').attr('height', windowHeight);
}

function perturb(poly) {
	let d = {};
	for (let p of poly) {
		let x = p[0];
		if (d[x]) {
			d[x].push(p);
		} else {
			d[x] = [p];
		}
	}

	for (let x of Object.keys(d)) {
		let pts = d[x];
		let n = d[x].length;
		for (let i = 0; i < n; i++) {
			d[x][i][0] += 0.001 * (i + (n - 1) / 2);
		}
	}
}

function calculatePerturbances(r) {
	let vertMap = {};
	let horizMap = {};
	n = r.Ptarget.length;

	for (let i = 0; i < n; i++) {
		let p1 = r.Ptarget[i];
		let p2 = r.Ptarget[(i + 1) % n];
		let vert = p1[0] == p2[0];
		let horiz = p1[1] == p2[1];
		if (!(vert && horiz)) {
			r.startingVertical = (i % 2) ^ vert;
			break;
		}
	}

	for (let i = 0; i < n; i++) {
		let p1 = r.Ptarget[i];
		let p2 = r.Ptarget[(i + 1) % n];
		let vert = (i % 2) ^ r.startingVertical;
		// if (vert && horiz) {
		// 	console.log('zero length edge', p1, p2);
		// } else 
		if (vert) {
			if (!vertMap[p1[0]]) vertMap[p1[0]] = [];
			vertMap[p1[0]].push(i);
		} else {
			if (!horizMap[p1[1]]) horizMap[p1[1]] = [];
			horizMap[p1[1]].push(i);
		}
	}

	r.perturbance = r.Ptarget.map(x => [0, 0]);
	for (let inds of Object.values(vertMap)) {
		let n = inds.length;
		for (let off = 0; off < n; off++) {
			let i = inds[off];
			//console.log('moving vertical edge horizontally', i)
			r.perturbance[i][0] += off - (n - 1) / 2;
			r.perturbance[(i + 1) % r.perturbance.length][0] += off - (n - 1) / 2;
		}
	}

	//console.log(vertMap, horizMap);

	for (let inds of Object.values(horizMap)) {
		let n = inds.length;
		for (let off = 0; off < n; off++) {
			let i = inds[off];

			//console.log('moving horizontal edge vertically', i)
			r.perturbance[i][1] += off - (n - 1) / 2;
			r.perturbance[(i + 1) % r.perturbance.length][1] += off - (n - 1) / 2;
		}
	}

	//console.log('perturbance:', r.perturbance);
}

function findReducibleEdge(poly, obs, v0) {
	let n = poly.length;
	for (let i = 0; i < n; i++) {
		let q = poly[i];
		let r = poly[(i + 1) % n];
		let qrvert = (i % 2) ^ v0;
		if (comparePoints(q, r)) {
			return [i, 'elide'];
		}

		let p = poly[(i - 1 + n) % n];
		let s = poly[(i + 2) % n];

		let orientpq = q[1 - qrvert] - p[1 - qrvert];
		let orientrs = s[1 - qrvert] - r[1 - qrvert];

		if (orientrs == orientrs && orientrs != 0) {
			// we have a bracket bois
			if (qrvert) {
				// [ or ]
				if (orientrs > 0) {
					// right facing bracket [
					let ok = true;
					for (let [ox, oy] of obs) {
						if (Math.min(q[1], r[1]) < oy && oy < Math.max(q[1], r[1])) {
							if (ox > q[0]) {
								// inside to the right
								if (ox < q[0] + 2) {
									// we cannot shift to the right
									ok = false;
									break;
								}
							}
						}
					}
					if (ok) {
						return [i, 'rightslide'];
					}
				} else {
					// left facing bracket ]
					let ok = true;
					for (let [ox, oy] of obs) {
						if (Math.min(q[1], r[1]) < oy && oy < Math.max(q[1], r[1])) {
							if (ox < q[0]) {
								// inside to the right
								if (ox > q[0] - 2) {
									// we cannot shift to the left
									ok = false;
									break;
								}
							}
						}
					}
					if (ok) {
						return [i, 'leftslide'];
					}
				}
			} else {
				// n or u
				if (orientrs > 0) {
					// up facing bracket u
					let ok = true;
					for (let [ox, oy] of obs) {
						if (Math.min(q[0], r[0]) < ox && ox < Math.max(q[0], r[0])) {
							if (oy > q[1]) {
								// inside and above
								if (oy < q[1] + 2) {
									// we cannot shift up
									ok = false;
									break;
								}
							}
						}
					}
					if (ok) {
						return [i, 'upslide'];
					}
				} else {
					// down facing bracket n
					let ok = true;
					for (let [ox, oy] of obs) {
						if (Math.min(q[0], r[0]) < ox && ox < Math.max(q[0], r[0])) {
							if (oy < q[1]) {
								// inside and below
								if (oy > q[1] - 2) {
									// we cannot shift down
									ok = false;
									break;
								}
							}
						}
					}
					if (ok) {
						return [i, 'downslide'];
					}
				}
			}
		}
	}

	return [-1, 'done'];
}

function segments(poly) {
	let segs = [];
	for (let i = 0; i < poly.length; i++) {
		segs.push([poly[i], poly[(i + 1) % poly.length]]);
	}

	segs = segs.filter((s, index) => {
		return segs.findIndex(x => compareSegments(s, x)) == index;
	});

	return segs;
}

function isCollinear(a, b, c, inbetween=false) {
	// three points are collinear if their slopes are the same (c[1]-a[1])/(c[0]-a[0]) == (c[1]-b[1])/(c[0]-b[0])
	// cross multiply to remove divisions that might cause error
	// inbetween will make the function only return true if c is between a and b
	return (c[1] - a[1]) * (c[0] - b[0]) == (c[1] - b[1]) * (c[0] - a[0])
		&& (!inbetween || (c[0] >= Math.min(a[0], b[0]) && c[0] <= Math.max(a[0], b[0]) && c[1] >= Math.min(a[1], b[1]) && c[1] <= Math.max(a[1], b[1])));
}

function isCollinearOpen(a, b, c, inbetween=false) {
	// three points are collinear if their slopes are the same (c[1]-a[1])/(c[0]-a[0]) == (c[1]-b[1])/(c[0]-b[0])
	// cross multiply to remove divisions that might cause error
	// inbetween will make the function only return true if c is between a and b
	return (c[1] - a[1]) * (c[0] - b[0]) == (c[1] - b[1]) * (c[0] - a[0])
		&& (!inbetween || (c[0] > Math.min(a[0], b[0]) && c[0] < Math.max(a[0], b[0]) && c[1] > Math.min(a[1], b[1]) && c[1] < Math.max(a[1], b[1])));
}

function isCounterClockwise(a, b, c) {
	return (c[1]-a[1]) * (b[0]-a[0]) > (b[1]-a[1]) * (c[0]-a[0])
}

function comparePoints(a, b) {
	return a[0] == b[0] && a[1] == b[1];
}

function compareSegments(a, b) {
	return comparePoints(a[0], b[0]) && comparePoints(a[1], b[1]) || comparePoints(a[0], b[1]) && comparePoints(a[1], b[0]);
}

function slope(p1, p2) {
	return (p1[1] - p2[1]) / (p1[0] - p2[0]);
}

function getIntersectionPoint(p1, p2, q1, q2) {
	if (!intersect(p1, p2, q1, q2)) {
		return null;
	}
	let m1 = slope(p1, p2);
	let m2 = slope(q1, q2);
	let x = ((q1[1] - p1[1]) - (m2 * q1[0] - m1 * p1[0])) / (m1 - m2);
	let y = m1 * (x - p1[0]) + p1[1];
	return [x, y];
}

function isSelfIntersecting(poly) {
	let n = poly.length;
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			if (intersect(poly[i], poly[(i+1)%n], poly[j], poly[(j+1)%n])) {
				return true;
			}
		}
	}

	return false;
}

function selfIntersections(poly, edgeIndices=false) {
	let pts = [];
	let n = poly.length;

	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			let pt = getIntersectionPoint(poly[i], poly[(i+1)%n], poly[j], poly[(j+1)%n]);
			if (pt) {
				if (poly.findIndex(p => p[0] == pt[0] && p[1] == pt[1]) == -1) {
					if (edgeIndices) {
						pts.push([pt, [i, j]]);
					} else {
						pts.push(pt);
					}
				}
			}
		}
	}

	return pts;
}

function selfIntersection(poly, edgeIndices=false) {
	let pts = [];
	let n = poly.length;

	for (let i = 0; i < n; i++) {
		for (let j = i + 2; j < n; j++) {
			let a = poly[i];
			let b = poly[(i+1)%n];
			let c = poly[j];
			let d = poly[(j+1)%n];
			if (comparePoints(a, c) || comparePoints(a, d) || comparePoints(b, c) || comparePoints(b, d)) {
				continue;
			}
			let pt = getIntersectionPoint(a, b, c, d);
			if (pt) { // && isFinite(pt[0]) && isFinite(pt[1])) {
				pt[0] = Math.round((pt[0] + Number.EPSILON) * 10000) / 10000;
				pt[1] = Math.round((pt[1] + Number.EPSILON) * 10000) / 10000;
				// console.log(pt, poly, poly.find(p => p[0] == pt[0] && p[1] == pt[1]));
				if (!poly.find(p => p[0] == pt[0] && p[1] == pt[1])) {
					if (edgeIndices) {
						return [pt, [i, j]];
					} else {
						return pt;
					}
				}
			}
		}
	}

	return null;
}

function intersectsVertical(a, b, x) {
	[a, b] = [a, b].sort((a, b) => a[0] - b[0]);
	//console.log(a[0], b[0], x, a[0] < x, x < b[0]);
	if (a[0] < x && x < b[0]) {
		let y = a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
		return [x, y];
	}
	return null;
}

function intersect(a, b, c, d) {
	// checks if the segments overlap. still has an issue (if segments overlap by an endpoint returns true)
	if (isCollinear(a, b, c) && isCollinear(a, b, d)) {
		return isCollinear(a, b, c, true) || isCollinear(a, b, d, true);
	}
	if (isCollinearOpen(a, b, c) || isCollinearOpen(a, b, d)) {
		return isCollinearOpen(a, b, c, true) || isCollinearOpen(a, b, d, true);
	}
	if (isCollinearOpen(a, c, d) || isCollinearOpen(b, c, d)) {
		return isCollinearOpen(c, d, a, true) || isCollinearOpen(c, d, b, true);
	}
	return isCounterClockwise(a, c, d) != isCounterClockwise(b, c, d) && isCounterClockwise(a, b, c) != isCounterClockwise(a, b, d);
}

function isOnPath(path, p, closed=true) {
	let n = path.length;
	for (let i = 0; i < n; i++) {
		if (!closed && i == n - 1) return false;
		if (isCollinear(path[i], path[(i + 1) % n], p, true)) {
			return true;
		}
	}

	return false;
}

function clearAll() {
	polygons = [];
	resetAnimParams();
	selectedPolygonIndex = -1;
	toolButtonSelected($('#selectbutton'), 'select');
	selectedPoints = [];
	newPoly = null;
}

$(document).ready(function() {
	resizeWindow();

	$('#clearbutton').click(clearAll);

	$('#selectbutton').click(function() {
		toolButtonSelected(this, 'select');
	});

	$('#polybutton').click(function() {
		toolButtonSelected(this, 'poly');
	});

	$('#windingbutton').click(function() {
		toolButtonSelected(this, 'winding');
	});

	$('#triangulatebutton').click(function() {
		toolButtonSelected(this, 'triangulate');
	});

	$('#rectificationbutton').click(function() {
		toolButtonSelected(this, 'rectification');
	});

	window.addEventListener('resize', resizeWindow);
	window.addEventListener('blur', function() {
		mouseDown = false;
	});

	$(document).contextmenu(function(e) {
		e.preventDefault();
	});

	$(document).mousedown(function(e) {
		mouseDown = true;
		mouseMoved = false;
	});

	$(document).mouseup(function(e) {
		mouseDown = false;
		if (e.target.classList.contains('inputtable')) {
			let x = Math.round(mouseGridX);
			let y = Math.round(mouseGridY);
			if (!mouseMoved && currentTool == 'select') {
				selectPolygon(x, y);
			}

			if (currentTool == 'poly') {
				if (e.button == 0) {
					let x = Math.round(mouseGridX);
					let y = Math.round(mouseGridY);
					if (newPoly && newPoly.length > 0) {
						let n = newPoly.length;
						for (let i = 0; i < n - 1; i++) {
							// console.log(isCollinear(newPoly[n - 1], [x, y], newPoly[i], true));
							if (isCollinear(newPoly[n - 1], [x, y], newPoly[i], true)) {
								//console.log('causing collinearity with point', i);
								if (!(i == 0 && x == newPoly[0][0] && y == newPoly[0][1])) {
									console.log('ignored point that would cause previous point to be in between collinear');
									return;
								}
							}
							if (i > 0 && isCollinear(newPoly[i - 1], newPoly[i], [x, y], true)) {
								if (!(i == 1 && x == newPoly[0][0] && y == newPoly[0][1])) {
									console.log('ignored in between collinear point');
									return;
								}
							}
						}
						
						if (n > 1 && isCollinear(newPoly[n - 2], newPoly[n - 1], [x, y])) {
							newPoly.pop();
							console.log('removed collinear point');
						}
						if (x == newPoly[0][0] && y == newPoly[0][1]) {
							if (newPoly.length > 2) {
								if (isCollinear(newPoly[0], newPoly[1], newPoly[newPoly.length - 1])) {
									newPoly.shift();
									console.log('removed collinear point at end');
								}
								polygons.push(newPoly);
							} else {
								console.log('removed degenerate polygon (<3 vertices)');
							}
							newPoly = null;
						} else {
							newPoly.push([x, y]);
						}
					} else {
						newPoly = [[x, y]];
					}
				} else if (e.button == 2) {
					if (newPoly && newPoly.length > 0) {
						newPoly.pop();
					}
				}
			}

			if (currentTool == 'winding') {
				if (!mouseMoved) {
					if (!selectPolygon(x, y, false) && selectedPolygonIndex != -1) {
						selectedPoints = [[x, y]];
						resetAnimParams();
					}
				}
				updateWinding();
			}

			if (currentTool == 'triangulate') {
				if (selectPolygon(x, y, false)) {
					resetAnimParams();
				}
			}

			if (currentTool == 'rectification') {
				let r = rectAnimParams;
				if (r.stage == 'selectpoly') {
					selectPolygon(x, y, false);
				} else if (r.stage == 'selectpoints') {
					if (isOnPath(r.P, [x, y])) {
						displayInfo('Point must not be on polygon boundary');
						return;
					}

					displayInfo('Select obstacle points (Enter to confirm)');

					let i = selectedPoints.findIndex(p => p[0] == x && p[1] == y);
					if (i == -1) {
						selectedPoints.push([x, y]);
					} else {
						selectedPoints.splice(i, 1);
					}
				}
			}
		}
	});

	$(document).mousemove(function(e) {
		if (mouseDown) {
			mouseMoved = true;
		}
		prevPageX = mousePageX;
		prevPageY = mousePageY;
		prevGridX = mouseGridX;
		prevGridY = mouseGridY;
		mousePageX = e.pageX;
		mousePageY = e.pageY;
		[mouseGridX, mouseGridY] = gridConvert(mousePageX, mousePageY);

		if (currentTool != 'poly' && mouseDown) { // currentTool == 'select' && 
			centerCoord[0] += (prevPageX - mousePageX) / pixelsPerCoord;
			centerCoord[1] -= (prevPageY - mousePageY) / pixelsPerCoord;
		}
	});

	$(document).keydown(function(e) {
		if (e.keyCode == 46) {
			if (currentTool == 'select' && selectedPolygonIndex != -1) {
				polygons.splice(selectedPolygonIndex, 1);
				selectedPolygonIndex = -1;
			}
		}
		if (e.keyCode == 13) {
			if (currentTool == 'rectification' && rectAnimParams.stage == 'selectpoints') {
				rectAnimParams.stage = 'init';
				displayInfo('');
			}
		}
		if (e.shiftKey || e.keyCode == 18) {
			shiftKeyDown = true;
			console.log('down');
		}
	});

	$(document).keyup(function(e) {
		if (!e.shiftKey) {
			shiftKeyDown = false;
			console.log('up');
		}
	});

	window.addEventListener('wheel', e => {
		if (shiftKeyDown) {
			if (currentTool == 'winding') {
			windingAnimParams.animationSpeed /= (1 + Math.sign(e.deltaY) * 0.1);
			} else if (currentTool == 'triangulate') {
				triangAnimParams.animStepTime *= (1 + Math.sign(e.deltaY) * 0.1);
			} else if (currentTool == 'rectification') {
				rectAnimParams.animStepTime *= (1 + Math.sign(e.deltaY) * 0.1);
			}
		} else {
			if (currentTool == 'rectification' && (rectAnimParams.stage == 'rectify' || rectAnimParams.stage == 'reduce')) {
				
			} else {
				let d = Math.exp((e.deltaY > 0 ? -1 : 1) * 0.1);
				pixelsPerCoord *= d;
				let newloc = gridConvert(mousePageX, mousePageY);
				centerCoord[0] += (mouseGridX - newloc[0]);
				centerCoord[1] += (mouseGridY - newloc[1]);
			}
		}
	});

	window.requestAnimationFrame(loop);
});

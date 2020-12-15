var mouseDown = false;
var mousePageX = 0;
var mousePageY = 0;
var mouseGridX = 0;
var mouseGridY = 0;
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

const triangulationStepTimeMs = 400;

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
		intersectionListIndex: 0
	};
	triangAnimParams = {
		diagonals: [],
		subcalls: [],
		done: false
	};
}

resetAnimParams();

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
			w.rayProgress += 0.002 * dt;
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
					w.edgeProgress += 0.002 * dt;
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
			} else if (s.t < triangulationStepTimeMs) {
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
	if (currentTool == 'winding') {
		updateWinding(dt);
	} else if (currentTool == 'triangulate') {
		updateTriangulate(dt);
	}
}

function renderWinding(ctx) {
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
}

function renderTriangulate(ctx) {
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
			ctx.lineTo(...s.P[s.j]);
			ctx.stroke();

			ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
			ctx.beginPath();
			ctx.moveTo(...s.P[s.k]);
			ctx.lineTo(...s.P[(s.k+1) % n]);
			ctx.stroke();
		}
	}
}

function render() {
	let canvas = document.getElementById('canvas');
	let ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, windowWidth, windowHeight);
	ctx.save();
	ctx.translate(windowWidth / 2, windowHeight / 2);
	ctx.scale(pixelsPerCoord, -pixelsPerCoord);
	ctx.translate(-centerCoord[0], -centerCoord[1]);
	drawGrid(ctx);
	drawPolys(ctx);

	if (currentTool == 'winding') {
		renderWinding(ctx);
	} else if (currentTool == 'triangulate') {
		renderTriangulate(ctx);
	}

	ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
	ctx.beginPath();
	ctx.arc(Math.round(mouseGridX), Math.round(mouseGridY), 4 / pixelsPerCoord, 0, 2 * Math.PI);
	ctx.fill();

	ctx.restore();

	$('#coords').html(`(${Math.round(mouseGridX)}, ${Math.round(mouseGridY)})`);
}

function drawGrid(ctx) {
	let minX = (-windowWidth / 2) / pixelsPerCoord + centerCoord[0];
	let maxX = (windowWidth / 2) / pixelsPerCoord + centerCoord[0];
	let minY = (-windowHeight / 2) / pixelsPerCoord + centerCoord[1];
	let maxY = (windowHeight / 2) / pixelsPerCoord + centerCoord[1];
	bounds = [minX, maxX, minY, maxY];
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
		drawPolygonPoints(ctx, newPoly);
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
		drawPolygonPoints(ctx, poly);
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

function drawPolygonPoints(ctx, poly) {
	for (let [x, y] of poly) {
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

function intersect(a, b, c, d) {
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
	});

	window.requestAnimationFrame(loop);
});

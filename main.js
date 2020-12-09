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

var centerCoord = [0, 0];
//var cellSize = 10;
var pixelsPerCoord = 25;

function resetAnimParams() {
	windingAnimParams = [0, 0, 0, 0, 0, 0, 0];
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
	displayInfo('Winding Number: ' + windingAnimParams[6]);
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
		} else if (windingAnimParams[1] == 0) {
			let min = polygons[selectedPolygonIndex][0][1];
			for (let [x, y] of polygons[selectedPolygonIndex]) {
				if (y < min) min = y;
			}
			windingAnimParams[1] = min - selectedPoints[0][1] - 2;
			if (windingAnimParams[1] > 0) windingAnimParams[1] = -2;
		}
		if (windingAnimParams[0] < 1) {
			windingAnimParams[0] += 0.002 * dt;
		} else {
			if (windingAnimParams[2] < polygons[selectedPolygonIndex].length) {
				if (windingAnimParams[3] > 1) {
					windingAnimParams[2]++;
					windingAnimParams[3] = 0;
				}
				if (windingAnimParams[2] >= polygons[selectedPolygonIndex].length) {
					// done
				} else {
					if (windingAnimParams[3] == 0) {
						let P = polygons[selectedPolygonIndex];
						let n = P.length;
						let i = windingAnimParams[2];
						let o = selectedPoints[0];
						o[0] += 0.0001;	
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
							windingAnimParams[4] = (o[0] - p[0]) / (q[0] - p[0]);
							windingAnimParams[5] = change;
							//console.log('edge from', p, 'to', q, 'crosses', change);
						} else {
							windingAnimParams[4] = 0;
							windingAnimParams[5] = 0;
							//console.log('edge from', p, 'to', q, 'does not cross');
						}
					}

					let prev = windingAnimParams[3];
					windingAnimParams[3] += 0.002 * dt;
					if (prev < windingAnimParams[4] && windingAnimParams[3] > windingAnimParams[4]) {
						windingAnimParams[6] += windingAnimParams[5];
					}
				}
			}
		}
		
	}
}

function toolButtonSelected(toolBtn, toolName) {
	currentTool = toolName;
	$('.btn').removeClass('selected');
	$(toolBtn).addClass('selected');

	if (toolName != 'poly') {
		newPoly = null;
	}

	hideInfo();
	selectedPoints = [];

	if (toolName == 'winding') {
		resetAnimParams();
		updateWinding();
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

function loop(curTime) {
	update(curTime);
	render(curTime);
	window.requestAnimationFrame(loop);
}

function update() {

}

var prevTime = 0;

function render(curTime) {
	let dt = curTime - prevTime;
	prevTime = curTime;	
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
		ctx.fillStyle = 'rgba(0, 0, 255, 1)';
		ctx.strokeStyle = 'rgba(0, 0, 255, 0.5)';
		if (selectedPoints[0]) {
			let [x, y] = selectedPoints[0];
			let rayHeight = windingAnimParams[0] * windingAnimParams[1];
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

			if (windingAnimParams[0] >= 1) {
				let poly = polygons[selectedPolygonIndex];
				if (windingAnimParams[2] < poly.length) {
					ctx.strokeStyle = 'rgb(0, 255, 0)';
					ctx.lineWidth = 3 / pixelsPerCoord;
					ctx.beginPath();
					ctx.moveTo(poly[0][0], poly[0][1]);
					for (let i = 1; i <= windingAnimParams[2]; i++) {
						ctx.lineTo(poly[i][0], poly[i][1]);
					}
					
					let p = poly[windingAnimParams[2]];
					let q = poly[(windingAnimParams[2] + 1) % poly.length];
					ctx.lineTo(p[0] + (q[0] - p[0]) * windingAnimParams[3], p[1] + (q[1] - p[1]) * windingAnimParams[3]);

					ctx.stroke();
				} else if (windingAnimParams[2] == poly.length) {
					ctx.strokeStyle = 'rgb(0, 255, 0)';
					ctx.lineWidth = 3 / pixelsPerCoord;
					drawPolygon(ctx, poly);
				}
			}
		}
		updateWinding(dt);
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

$(document).ready(function() {
	resizeWindow();

	$('#selectbutton').click(function() {
		toolButtonSelected(this, 'select');
	});

	$('#polybutton').click(function() {
		toolButtonSelected(this, 'poly');
	});

	$('#windingbutton').click(function() {
		toolButtonSelected(this, 'winding');
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
			if (selectedPolygonIndex != -1) {
				polygons.splice(selectedPolygonIndex, 1);
				selectedPolygonIndex = -1;
			}
		}
	});

	window.requestAnimationFrame(loop);
});

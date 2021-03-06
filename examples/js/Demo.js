var vec2 =      p2.vec2
,   Spring =    p2.Spring
,   Body =      p2.Body
,   Circle =    p2.Circle
,   Capsule =   p2.Capsule
,   Convex =    p2.Convex
,   Compound =  p2.Compound
,   Plane =     p2.Plane
,   Rectangle=  p2.Rectangle
,   Particle =  p2.Particle
,   Line =      p2.Line
,   EventEmitter = p2.EventEmitter
,   RevoluteConstraint = p2.RevoluteConstraint

// shim layer with setTimeout fallback
var requestAnimationFrame =     window.requestAnimationFrame       ||
                                window.webkitRequestAnimationFrame ||
                                window.mozRequestAnimationFrame    ||
                                window.oRequestAnimationFrame      ||
                                window.msRequestAnimationFrame     ||
                                function( callback ){
                                    window.setTimeout(callback, 1000 / 60);
                                };

(function($){
    $.fn.disableSelection = function() {
        return this
                 .attr('unselectable', 'on')
                 .css('user-select', 'none')
                 .on('selectstart', false);
    };
})(jQuery);

function DemoStates(){};
DemoStates.DEFAULT =            1;
DemoStates.PANNING =            2;
DemoStates.DRAGGING =           3;
DemoStates.DRAWPOLYGON =        4;
DemoStates.DRAWINGPOLYGON  =    5;
DemoStates.DRAWCIRCLE =         6;
DemoStates.DRAWINGCIRCLE  =     7;

/**
 * Base class for rendering of a scene.
 * @class Demo
 * @constructor
 * @param {World} world
 */
function Demo(world){
    EventEmitter.call(this);

    var that = this;

    this.world = world;
    this.initialState = world.toJSON();

    this.state = DemoStates.DEFAULT;

    this.bodies=[];
    this.springs=[];
    this.paused = false;
    this.timeStep = 1/60;

    this.mouseConstraint = null;
    this.nullBody = new Body();
    this.pickPrecision = 5;

    this.drawPoints = [];
    this.drawPointsChangeEvent = { type : "drawPointsChange" };
    this.drawCircleCenter = vec2.create();
    this.drawCirclePoint = vec2.create();
    this.drawCircleChangeEvent = { type : "drawCircleChange" };

    // If contacts should be drawn
    this.drawContacts = false;

    this.stats_sum = 0;
    this.stats_N = 100;
    this.stats_Nsummed = 0;
    this.stats_average = -1;

    this.w = $(window).width();
    this.h = $(window).height();

    this.init();
    this.resize(this.w,this.h);
    this.render();
    this.createStats();
    this.createMenu();

    world.on("postStep",function(e){
        that.render();
        that.updateStats();
    }).on("addBody",function(e){
        that.addVisual(e.body);
    }).on("removeBody",function(e){
        that.removeVisual(e.body);
    }).on("addSpring",function(e){
        that.addVisual(e.spring);
    }).on("removeSpring",function(e){
        that.removeVisual(e.spring);
    });

    $(window).resize(function(){
        that.resize($(window).width(), $(window).height());
    });

    document.addEventListener('keypress',function(e){
        if(e.keyCode){
            var s = that.state;
            switch(String.fromCharCode(e.keyCode)){
                case "p": // pause
                    that.paused = !that.paused;
                    break;
                case "s": // step
                    that.world.step(that.world.lastTimeStep);
                    break;
                case "r": // restart
                    that.removeAllVisuals();
                    that.world.fromJSON(that.initialState);
                    break;
                case "c": // toggle draw contacts
                    that.drawContacts = !that.drawContacts;
                    break;
                case "d": // toggle draw polygon mode
                    that.state = (s == DemoStates.DRAWPOLYGON ? DemoStates.DEFAULT : s = DemoStates.DRAWPOLYGON);
                    break;
                case "a": // toggle draw circle mode
                    that.state = (s == DemoStates.DRAWCIRCLE ? DemoStates.DEFAULT : s = DemoStates.DRAWCIRCLE);
                    break;
            }
        }
    });

    // Add initial bodies
    for(var i=0; i<world.bodies.length; i++)
        this.addVisual(world.bodies[i]);
    for(var i=0; i<world.springs.length; i++)
        this.addVisual(world.springs[i]);
}
Demo.prototype = new EventEmitter();

/**
 * Should be called by subclasses whenever there's a mousedown event
 */
Demo.prototype.handleMouseDown = function(physicsPosition){
    switch(this.state){

        case DemoStates.DEFAULT:
            var result = this.world.hitTest(physicsPosition,world.bodies,this.pickPrecision);
            if(result.length > 0){
                var b = result[0]; // The grabbed body
                this.state = DemoStates.DRAGGING;
                // Add mouse joint to the body
                var localPoint = vec2.create();
                b.toLocalFrame(localPoint,physicsPosition);
                this.world.addBody(this.nullBody);
                this.mouseConstraint = new RevoluteConstraint(  this.nullBody, physicsPosition,
                                                                    b,             localPoint);
                this.world.addConstraint(this.mouseConstraint);
            } else {
                this.state = DemoStates.PANNING;
            }
            break;

        case DemoStates.DRAWPOLYGON:
            // Start drawing a polygon
            this.state = DemoStates.DRAWINGPOLYGON;
            this.drawPoints = [];
            var copy = vec2.create();
            vec2.copy(copy,physicsPosition);
            this.drawPoints.push(copy);
            this.emit(this.drawPointsChangeEvent);
            break;

        case DemoStates.DRAWCIRCLE:
            // Start drawing a circle
            this.state = DemoStates.DRAWINGCIRCLE;
            vec2.copy(this.drawCircleCenter,physicsPosition);
            vec2.copy(this.drawCirclePoint, physicsPosition);
            this.emit(this.drawCircleChangeEvent);
            break;
    }
};

/**
 * Should be called by subclasses whenever there's a mousedown event
 */
Demo.prototype.handleMouseMove = function(physicsPosition){
    var sampling = 0.4;
    switch(this.state){
        case DemoStates.DRAWINGPOLYGON:
            // drawing a polygon - add new point
            var sqdist = vec2.dist(physicsPosition,this.drawPoints[this.drawPoints.length-1]);
            if(sqdist > sampling*sampling){
                var copy = [0,0];
                vec2.copy(copy,physicsPosition);
                this.drawPoints.push(copy);
                this.emit(this.drawPointsChangeEvent);
            }
            break;

        case DemoStates.DRAWINGCIRCLE:
            // drawing a circle - change the circle radius point to current
            vec2.copy(this.drawCirclePoint, physicsPosition);
            this.emit(this.drawCircleChangeEvent);
            break;
    }
};

/**
 * Should be called by subclasses whenever there's a mouseup event
 */
Demo.prototype.handleMouseUp = function(physicsPosition){
    switch(this.state){

        case DemoStates.DEFAULT:
            break;

        case DemoStates.DRAGGING:
            // Drop constraint
            this.world.removeConstraint(this.mouseConstraint);
            this.mouseConstraint = null;
            this.world.removeBody(this.nullBody);

        case DemoStates.PANNING:
            this.state = DemoStates.DEFAULT;
            break;

        case DemoStates.DRAWINGPOLYGON:
            // End this drawing state
            this.state = DemoStates.DRAWPOLYGON;
            if(this.drawPoints.length > 3){
                // Create polygon
                var b = new Body({ mass : 1 });
                if(b.fromPolygon(this.drawPoints,{
                    removeCollinearPoints : 0.01,
                })){
                    this.world.addBody(b);
                }
            }
            this.drawPoints = [];
            this.emit(this.drawPointsChangeEvent);
            break;

        case DemoStates.DRAWINGCIRCLE:
            // End this drawing state
            this.state = DemoStates.DRAWCIRCLE;
            var R = vec2.dist(this.drawCircleCenter,this.drawCirclePoint);
            if(R > 0){
                // Create circle
                var b = new Body({ mass : 1, position : this.drawCircleCenter });
                b.addShape(new Circle(R));
                this.world.addBody(b);
            }
            vec2.copy(this.drawCircleCenter,this.drawCirclePoint);
            this.emit(this.drawCircleChangeEvent);
            break;
    }
};

/**
 * Update stats
 */
Demo.prototype.updateStats = function(){
    this.stats_sum += this.world.lastStepTime;
    this.stats_Nsummed++;
    if(this.stats_Nsummed == this.stats_N){
        this.stats_average = this.stats_sum/this.stats_N;
        this.stats_sum = 0.0;
        this.stats_Nsummed = 0;
    }
    this.stats_stepdiv.innerHTML = "Physics step: "+(Math.round(this.stats_average*100)/100)+"ms";
    this.stats_contactsdiv.innerHTML = "Contacts: "+this.world.narrowphase.contactEquations.length;
};

/**
 * Add an object to the demo
 * @param  {mixed} obj Either Body or Spring
 */
Demo.prototype.addVisual = function(obj){
    if(obj instanceof Spring){
        this.springs.push(obj);
        this.addRenderable(obj);
    } else if(obj instanceof Body){
        if(obj.shapes.length){ // Only draw things that can be seen
            this.bodies.push(obj);
            this.addRenderable(obj);
        }
    } else
        throw new Error("Visual type not recognized.");
};

/**
 * Removes all visuals from the scene
 */
Demo.prototype.removeAllVisuals = function(){
    var bodies = this.bodies,
        springs = this.springs;
    while(bodies.length)
        this.removeVisual(bodies[bodies.length-1]);
    while(springs.length)
        this.removeVisual(springs[springs.length-1]);
};

/**
 * Remove an object from the demo
 * @param  {mixed} obj Either Body or Spring
 */
Demo.prototype.removeVisual = function(obj){
    this.removeRenderable(obj);
    if(obj instanceof Spring){
        var idx = this.springs.indexOf(obj);
        if(idx != -1)
            this.springs.splice(idx,1);
    } else if(obj instanceof Body){
        var idx = this.bodies.indexOf(obj);
        if(idx != -1)
            this.bodies.splice(idx,1);
    } else {
        console.error("Visual type not recognized...");
    }
};

/**
 * Create the container/divs for stats
 */
Demo.prototype.createStats = function(){
    var stepDiv = document.createElement("div");
    var vecsDiv = document.createElement("div");
    var matsDiv = document.createElement("div");
    var contactsDiv = document.createElement("div");
    stepDiv.setAttribute("id","step");
    vecsDiv.setAttribute("id","vecs");
    matsDiv.setAttribute("id","mats");
    contactsDiv.setAttribute("id","contacts");
    document.body.appendChild(stepDiv);
    document.body.appendChild(vecsDiv);
    document.body.appendChild(matsDiv);
    document.body.appendChild(contactsDiv);
    this.stats_stepdiv = stepDiv;
    this.stats_contactsdiv = contactsDiv;
};

Demo.prototype.createMenu = function(){
    var that = this;

    // Insert logo
    $("body").append($("<div id='logo'><h1><a href='http://github.com/schteppe/p2.js'>p2.js</a></h1><p>Physics Engine</p></div>").disableSelection());

    // Insert menu
    var $menucontainer = $([
        "<div id='menu-container'>",
            "<button class='btn' id='menu-container-open'>Open menu</button>",
            "<div id='menu' class='well'>",
                "<button class='btn' id='menu-hide'>Hide menu</button>",
                "<fieldset id='menu-controls-container'>",
                    "<legend>Simulation control</legend>",
                    "<button class='btn' id='menu-playpause'>Pause</button>",
                    "<button class='btn' id='menu-restart'>Restart</button>",
                "</fieldset>",

                "<fieldset id='menu-solver-container'>",
                    "<legend>Solver</legend>",
                    "<label>Relaxation</label>",
                    "<input class='input-block-level' id='menu-solver-relaxation' type='number' step='any' min='0' value='4'>",
                    "<label>Stiffness</label>",
                    "<input class='input-block-level' id='menu-solver-stiffness' type='number' step='any' min='0' value='"+this.world.solver.stiffness+"'>",
                "</fieldset>",

            "</div>",
        "</div>"
    ].join("\n")).disableSelection();
    $("body").append($menucontainer);

    var $menu = $("#menu").hide(),
        $openButton = $("#menu-container-open");

    // Hide menu
    $("#menu-hide").click(function(e){
        $menu.hide();
        $openButton.show();
    });

    // Open menu
    $("#menu-container-open").click(function(e){
        $menu.show();
        $openButton.hide();
    });

    // Play/pause
    $("#menu-playpause").click(function(e){
        that.paused = !that.paused;
        if(that.paused) $(this).text("Play");
        else            $(this).text("Pause");
    });

    // Restart
    $("#menu-restart").click(function(e){
        // Until Demo gets a restart() method
        that.removeAllVisuals();
        that.world.fromJSON(that.initialState);
    });

    $("#menu-solver-relaxation").change(function(e){
        that.world.solver.relaxation = parseFloat($(this).val());
    });
    $("#menu-solver-stiffness").change(function(e){
        that.world.solver.stiffness = parseFloat($(this).val());
    });
};

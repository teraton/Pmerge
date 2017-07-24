#!/usr/bin/env node

// a small command line utility to merge package.json files smartly. It will take version, licences and other information from the main file
// and merge other package.json ending files into this file. It will take the newest versions from the package.json files suplied

"use strict";

const program = require("commander");
const merge = require("package-merge");
const fs = require ('fs');

const LOG = "PMERGE: ";
const ERR = "ERROR: ";

//
var conflictingDependencies = [];
var conflictingScripts = [];

//we will probably need a version merge strategy option here also
program
    .version('1.0.0')
    .option('-m, --mainfile [mainFile]','main package.json file to use')
    .option('-p, --path [path]', "path where to look for additional package.json files")
    .option('-a, --authorMerge',"merges authors from other package.json files")
    .option('-s --scriptMerge',"merge scripts from other package.json files EXPERIMENTAL")
    .option('-t --targetFile', "target output file, otherwise package.json will be overwritten")
    .parse(process.argv);
if(!program.path){
    console.log(ERR + "No path to packages.json files specified.")
    process.exit(1);
}


let mainFile = {};

if(program.mainFile) {
    if(fs.existsSync(program.mainFile)){
        mainFile = fs.readFileSync(program.mainFile);
        console.log(LOG + "found main file " + program.mainFile );
    }    
}
else{
    console.log(LOG + "no main file specified, defaulting to ./package.json ");
    //TODO check if package json exists
    if(fs.existsSync("package.json")){
        mainFile = fs.readFileSync("package.json");
    }    
    
}

//get a list of files to be checked from path.
let mainObject = JSON.parse(mainFile);
let packageObjects = [];

if(program.path) {
    //read the directory 
    console.log(LOG + "looking for files from "+ program.path)
    var files = fs.readdirSync(program.path);

    files.forEach(file => {
        
        if( file.endsWith("package.json")){
            console.log(LOG + "Found: " + file);
    
            packageObjects.push( JSON.parse(fs.readFileSync(program.path+file)));
        }
        
    })
    if(packageObjects.length == 0){
        console.log(LOG + "Did not find any files from path");
    }

    console.log(LOG + "merging JSON files");
    let targetObject = mergeJSON(mainObject,packageObjects);

    //write target object to file
    let writePath = "./package.json";
    if (program.targetFile){
        writePath = program.targetFile;
        console.log(LOG + "Writing to target file " + program.targetFile);
    }
    else{
        console.log(LOG + "Owerwriting original package.json")
    }
    
    fs.writeFileSync(writePath, JSON.stringify(targetObject));

    if(conflictingDependencies.length > 0){
    console.log(LOG + "The following dependencies were conflicting be sure to check for errors:");
    }
    else{
        console.log(LOG + "No conflicting dependencies found");
    }

    if(conflictingScripts.length > 0 && program.scriptMerge){
    console.log(LOG + "The following scripts were conflicting be sure to check for errors:");
    }
    conflictingScripts.forEach(key => {
        console.log(LOG + "    "+ key);
    })
}
else{
    console.log(ERR + "a path to package.json files expected");
    process.exit(1);   
}

//----------------------------------------------------------------
// FUNCTIONS
//----------------------------------------------------------------

function mergeJSON(mainObject, mergeObjects ){
    let targetObject = mainObject || {};

    if(program.authorMerge){
        mergeAuthor(targetObject,[mainObject, ...mergeObjects]);
    }

    if(program.scriptMerge){
        mergeScripts(targetObject,[mainObject, ...mergeObjects]);
    }

    mergeDeps(targetObject,[mainObject, ...mergeObjects]);

    return targetObject;
}

function mergeAuthor(targetObject,objectList){
    console.log(LOG + "Merging authors from packages");
    let authorList = [];
    objectList.forEach(JSONOBject => {
        console.log(JSONOBject.author);
        authorList.push(JSONOBject.author);
         
    })
    return authorList.join(',');
}
function mergeScripts(targetObject,objectList){
    console.log(LOG + "Merging scripts");
    var targetList = {};

    let targetObjectdeps = targetObject.dependencies;
    let targetObjectdepsKeys = Object.keys(targetObjectdeps);
    targetObjectdepsKeys.forEach(key => {
            
            targetList[key] = targetObjectdeps[key];  
    });
    objectList.forEach(JSONOBject => {
        let scripts = JSONOBject.scripts;
        let scriptsKeys = Object.keys(scripts);

        scriptsKeys.forEach(key =>{
            if(targetList.hasOwnProperty(key)){
                //a script with the same name has been found, merge with scriptname+time now, a silly way to do it but fast for debugging
                
                let conflictScript = key + "_conflicting_"+ Date.now();
                console.log(LOG + "A conflicting script name has been found, renaming to "+ conflictScript);
                targetList[conflictScript] = scripts[key];     
            }
            else{
                targetList[key] = deps[key];
            }
        })
              
    });
};

function mergeDeps(targetObject,objectList){

    console.log(LOG + "Merging dependencies");
    //When merging deps, by default grab the latest versions and use those. This might break the original projects, but then we have to "just" fix them.
    var targetList = {};
    //add values from target first

    let targetObjectdeps = targetObject.dependencies;
    let targetObjectdepsKeys = Object.keys(targetObjectdeps);
    
    targetObjectdepsKeys.forEach(key => {
            //console.log(LOG + "adding new dependency:" + key);
            targetList[key] = targetObjectdeps[key];  
    });

    objectList.forEach(JSONOBject => {
        let deps = JSONOBject.dependencies;
        let depsKeys = Object.keys(deps);

        depsKeys.forEach(key => {
            if (targetList.hasOwnProperty(key)){

                if(compareVersionNumbers(targetList[key],deps[key]) < 0){
                    targetList[key] = deps[key];

                    //console.log(LOG + "adding CONFLICTING dependency: " + key);
                    conflictingDependencies.push(key);
                }
                
			}
            
            else{
                //console.log(LOG + "adding new dependency:" + key);
                targetList[key] = deps[key];
            }
            
        });        
    });

    targetObject.dependencies = targetList;
}



//https://stackoverflow.com/questions/6832596/how-to-compare-software-version-number-using-js-only-number
function assert(x) {
    if (!x) {
        alert("Assert failed");
        debugger;
    }
}

function isPositiveInteger(x) {
    // http://stackoverflow.com/a/1019526/11236
    return /^\d+$/.test(x);
}

/**
 * Compare two software version numbers (e.g. 1.7.1)
 * Returns:
 *
 *  0 if they're identical
 *  negative if v1 < v2
 *  positive if v1 > v2
 *  Nan if they in the wrong format
 *
 *  E.g.:
 *
 *  assert(version_number_compare("1.7.1", "1.6.10") > 0);
 *  assert(version_number_compare("1.7.1", "1.7.10") < 0);
 *
 *  "Unit tests": http://jsfiddle.net/ripper234/Xv9WL/28/
 *
 *  Taken from http://stackoverflow.com/a/6832721/11236
 */
function compareVersionNumbers(v1, v2){

    var v1parts = v1.split('.');
    var v2parts = v2.split('.');

    //Teraton mod: if the first part contains a tilde or caret, remove it
    v1parts[0] = v1parts[0].split('^').join("");
    v1parts[0] = v1parts[0].split('~').join("");
    v2parts[0] = v2parts[0].split('^').join("");
    v2parts[0] = v2parts[0].split('~').join("");


    // First, validate both numbers are true version numbers
    function validateParts(parts) {
        for (var i = 0; i < parts.length; ++i) {
            if (!isPositiveInteger(parts[i])) {
                return false;
            }
        }
        return true;
    }
    if (!validateParts(v1parts) || !validateParts(v2parts)) {
        return NaN;
    }

    for (var i = 0; i < v1parts.length; ++i) {
        if (v2parts.length === i) {
            return 1;
        }

        if (v1parts[i] === v2parts[i]) {
            continue;
        }
        if (v1parts[i] > v2parts[i]) {
            return 1;
        }
        return -1;
    }

    if (v1parts.length != v2parts.length) {
        return -1;
    }

    return 0;
}

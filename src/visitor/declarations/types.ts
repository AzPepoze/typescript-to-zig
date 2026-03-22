import * as ts from "typescript";
import { TranspilerContext } from "../context";
import { mapType } from "../../types";

export function processInterfaceDeclaration(node: ts.InterfaceDeclaration, context: TranspilerContext) {
	const { checker } = context;
	const isGeneric = !!node.typeParameters && node.typeParameters.length > 0;

	if (isGeneric) {
		const genericParameters = node.typeParameters!.map((parameter: ts.TypeParameterDeclaration) => `comptime ${parameter.name.text}: type`).join(", ");
		context.zigOutput += `pub fn ${node.name.text}(${genericParameters}) type {\n`;
		context.zigOutput += `    return struct {\n`;
	} else {
		context.zigOutput += `pub const ${node.name.text} = struct {\n`;
	}

	node.members.forEach((memberDeclaration: ts.TypeElement) => {
		if (ts.isPropertySignature(memberDeclaration) && ts.isIdentifier(memberDeclaration.name)) {
			const type = checker.getTypeAtLocation(memberDeclaration);
			const typeString = checker.typeToString(type);
			const indent = isGeneric ? "        " : "    ";
			context.zigOutput += `${indent}${memberDeclaration.name.text}: ${mapType(typeString, context.typeAliases)},\n`;
		}
	});

	if (isGeneric) {
		context.zigOutput += `    };\n}\n\n`;
	} else {
		context.zigOutput += `};\n\n`;
	}
}

export function processEnumDeclaration(node: ts.EnumDeclaration, context: TranspilerContext) {
	context.zigOutput += `pub const ${node.name.text} = enum {\n`;
	node.members.forEach((memberDeclaration: ts.EnumMember) => {
		if (ts.isIdentifier(memberDeclaration.name)) {
			context.zigOutput += `    ${memberDeclaration.name.text},\n`;
		}
	});
	context.zigOutput += `};\n\n`;
}

export function processTypeAliasDeclaration(node: ts.TypeAliasDeclaration, context: TranspilerContext) {
	const { checker } = context;
	const type = checker.getTypeAtLocation(node);
	const typeString = checker.typeToString(type);

	if (ts.isTypeLiteralNode(node.type)) {
		context.zigOutput += `pub const ${node.name.text} = struct {\n`;
		node.type.members.forEach((memberDeclaration: ts.TypeElement) => {
			if (ts.isPropertySignature(memberDeclaration) && ts.isIdentifier(memberDeclaration.name)) {
				const memberType = checker.getTypeAtLocation(memberDeclaration);
				const memberTypeString = checker.typeToString(memberType);
				context.zigOutput += `    ${memberDeclaration.name.text}: ${mapType(memberTypeString, context.typeAliases)},\n`;
			}
		});
		context.zigOutput += "};\n\n";
	} else {
		context.zigOutput += `pub const ${node.name.text} = ${mapType(typeString, context.typeAliases)};\n\n`;
	}
}

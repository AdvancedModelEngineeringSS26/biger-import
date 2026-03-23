# bigER-langium

[Langium](https://langium.org/)-based realization of [bigER](https://github.com/borkdominik/bigER).

For information for developers see the [Developer Guide](./DeveloperGuide.md)

## Getting Started

Requirements:
- [Node.js](https://nodejs.org/en/) 20.10 or above
- [VS Code](https://code.visualstudio.com/) 1.67 or above
- [yarn](https://classic.yarnpkg.com/lang/en/docs/install/)


Clone the repository and in the root directory of the project, run the command:

```bash
yarn
```

The command automatically installs all dependencies and builds the modules located in `packages/`.
To run the extension in VS Code, press <kbd>F5</kbd> or select `Run ➜ Start Debugging` from the menu.

## How To Use

#### Creating a new file

To create a new file, make sure you have the extension installed. Then create a new file with the `.er` filename extension. At the top of the file declare the name of the model and the notation syntax. For instance:
```
erdiagram test
notation = uml
```

Below you can start writing your own ER-model.

To open the diagram view, click on the "open diagram" on the top right of the editor window. ![OpenDiagram](./media/tutorials/open_diagram.png)

#### Creating new Entities (and Attributes)

Entities are the base building block in BigER. Entities always have a name and may have attributes. To start an entity use the `entity` keyword, after that you may name the entity. Please note that entity names are unique. Having multiple entities with the same name will lead to validation errors. An entity may also inherit from another entity by using `extends [entity name]`.

Inside of an entity attributes can be declared. Attributes have an optional visibility modifier (public/private). Attribute names are also unique but only among an entity and its inheritors. An attribute can also have a datatype and an additional annotation. The additional annotation is used to signal that an attribute is a key, optional or has another modifier.

Below is an example of a valid entity:

```er
entity Customer {
  id: int key
  name: VARCHAR(255)
  birthdate: DATETIME
  age: INT derived
}
```

#### Creating new relationships

<ol>
<li> Ensure you have two or more entities </li>
<li> Declare a new relationship using the "rel" keyword followed by a name for the relationship </li>
<li> Define the content of the relationship inside curly brackets. At a minimum, the involved entities, tpye and cardinality must be defined.
<ol>
<li> The involved entities are defined by referencing two existing entities </li>
<li> The relationship type is defined by connecting the entities with a relation symbol. This symbol can be either "->" for a binary relationship, "-o"/"o-" for an aggregation on the side of the "o" or "-*"/"*-" for a composition on the side of the "*" </li>
<li> The cardinality is defined in square brackets immediately following each entity. The allowed quantities for cardinality are "0", "1" and "N", connected by two dots. </li>
</ol>
</li>
</ol>

Optionally, the following features are available:
- Roles: for each entity, the role it takes in the relationship can be defined inside the curly brackets by inserting a vertical line followed by a string after the quantity
- Attributes: after the required content, any number of attributes may be defined. See the tutorial on attributes for further details
Weak relationships: weak relationships between an entity and a weak entity can be defined as such using the "weak" keyword before declaring the relationship
- Ternary relationships: a relationship involving three entities can be defined by extending a binary relationship with an additional relationship type followed by an additional entity.

Note: Ternary Relationships do not support Aggregation or Composition, which may lead to unexpected behaviour. For cases where this is needed, use a series of binary relationships instead.

### Comments

To write a one-line comment, use "//" before your text
For multi-line comments use "/\*" to start and "\*/" to terminate
